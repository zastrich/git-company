// lib/onboarding/materialize.ts
//
// Single Responsibility: materializar um ProjectPlan em uma empresa real:
//   1. cria Company + AgentConfig no banco local (sempre);
//   2. opcionalmente cria o repo {prefix}org no GitHub, commita business.json,
//      aplica labels e configura webhook (reusa org-sync + validador de token).

import { prisma } from "../db/client";
import { ProjectPlan, PlanAgent } from "./architect";
import { createAuditLog } from "../db/audit";
import crypto from "crypto";

export interface MaterializeInput {
  plan: ProjectPlan;
  /** provider padrão (slug) para agentes AI que não especificarem outro */
  defaultProviderSlug: string;
  defaultModel: string;
  /** GitHub opcional — se ausente, cria só localmente */
  github?: {
    token: string;
    owner: string;
  };
}

export interface MaterializeResult {
  companyId: string;
  slug: string;
  agentsCreated: number;
  github: { created: boolean; repo?: string; message?: string };
}

async function resolveProviderId(slug: string): Promise<string | null> {
  const p = await prisma.aIProvider.findUnique({ where: { slug } });
  return p?.id ?? null;
}

function toAgentRow(
  agent: PlanAgent,
  companyId: string,
  providerId: string | null,
  model: string
) {
  const isHuman = agent.type === "human";
  return {
    companyId,
    agentId: agent.agentId,
    role: agent.role,
    type: agent.type,
    context: agent.context,
    providerId: isHuman ? null : providerId,
    model: isHuman ? "" : model,
    tickIntervalSeconds: 3600,
    labels: (agent.labels ?? []).join(","),
    subordinates: (agent.subordinates ?? []).join(","),
    isCeo: Boolean(agent.isCeo),
    githubUsername: agent.githubUsername ?? "",
  };
}

/**
 * Cria a empresa e os agentes localmente e, se houver credenciais GitHub,
 * provisiona o repositório de organograma.
 */
export async function materializePlan(input: MaterializeInput): Promise<MaterializeResult> {
  const { plan, defaultProviderSlug, defaultModel, github } = input;

  // slug único
  const existing = await prisma.company.findUnique({ where: { slug: plan.slug } });
  if (existing) {
    throw new Error(`Já existe um projeto com o slug "${plan.slug}". Escolha outro nome.`);
  }

  const providerId = await resolveProviderId(defaultProviderSlug);
  const repoName = `${plan.repoPrefix}org`;

  // 1. Criar empresa
  const company = await prisma.company.create({
    data: {
      name: plan.companyName,
      slug: plan.slug,
      repoPrefix: plan.repoPrefix,
      githubOwner: github?.owner ?? "local",
      githubToken: github?.token ?? "local-no-token",
      webhookSecret: crypto.randomUUID(),
      repoName,
      mission: plan.mission,
    },
  });

  // 2. Criar agentes (garante um CEO)
  const agents = plan.agents.length ? plan.agents : [];
  if (!agents.some((a) => a.isCeo) && agents.length) {
    agents[0].isCeo = true;
  }

  let created = 0;
  for (const agent of agents) {
    await prisma.agentConfig.create({
      data: toAgentRow(agent, company.id, providerId, defaultModel),
    });
    created++;
  }

  // Persistir o fluxo (colunas) escolhido. Vazio = fluxo não configurado ainda
  // (o kanban oferecerá "Criar com IA" depois).
  await prisma.companyConfig.upsert({
    where: { companyId_key: { companyId: company.id, key: "workflow_stages" } },
    update: { value: JSON.stringify(plan.columns ?? []) },
    create: { companyId: company.id, key: "workflow_stages", value: JSON.stringify(plan.columns ?? []) },
  });

  // Persistir o assistente usado na criação (para pré-seleção posterior no kanban).
  await prisma.companyConfig.upsert({
    where: { companyId_key: { companyId: company.id, key: "assistant_provider" } },
    update: { value: defaultProviderSlug },
    create: { companyId: company.id, key: "assistant_provider", value: defaultProviderSlug },
  });
  await prisma.companyConfig.upsert({
    where: { companyId_key: { companyId: company.id, key: "assistant_model" } },
    update: { value: defaultModel },
    create: { companyId: company.id, key: "assistant_model", value: defaultModel },
  });

  await createAuditLog({
    companyId: company.id,
    agentName: "Onboarding",
    action: "PROJECT_CREATED",
    details: { agents: created, github: Boolean(github) },
  });

  // 3. GitHub opcional
  const result: MaterializeResult = {
    companyId: company.id,
    slug: company.slug,
    agentsCreated: created,
    github: { created: false },
  };

  if (github) {
    try {
      const { Octokit } = await import("@octokit/rest");
      const octokit = new Octokit({ auth: github.token });

      // cria repo (ignora se já existe)
      try {
        await octokit.rest.repos.createForAuthenticatedUser({
          name: repoName,
          description: `Organograma de ${plan.companyName} — GitCompany-AI`,
          private: true,
          auto_init: true,
        });
      } catch (e: any) {
        if (e.status !== 422) throw e;
      }

      // push do business.json (reusa org-sync)
      const { pushToRemote } = await import("../sync/org-sync");
      await pushToRemote(company.id);

      // aplica labels do plano
      for (const label of plan.labels) {
        try {
          await octokit.rest.issues.createLabel({
            owner: github.owner,
            repo: repoName,
            name: label.name,
            color: label.color.replace(/^#/, ""),
            description: label.description,
          });
        } catch {
          /* label já existe */
        }
      }

      result.github = { created: true, repo: `${github.owner}/${repoName}` };
    } catch (err: any) {
      result.github = { created: false, message: err.message };
    }
  }

  return result;
}
