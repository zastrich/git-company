#!/usr/bin/env bun
// cli/tenant.ts
//
// CLI administrativa do GitCompany-AI.
//
// Comandos:
//   tenant:create   --name=<nome> --slug=<slug> --token=<github-token> --owner=<owner> --repo=<repo>
//   tenant:list
//   company:create  --name=<nome> --slug=<slug> --prefix=<prefix> --token=<token> --owner=<owner> --mission=<missão>
//   company:sync    --company=<slug> --direction=<push|pull>
//   provider:list
//   provider:add    --name=<nome> --slug=<slug> --type=<type> [--baseUrl=<url>] [--local]
//   agent:add       --company=<slug> --agentId=<id> --role=<role> --provider=<providerSlug> --model=<model> --context=<ctx> [--interval=<s>] [--labels=<l1,l2>] [--ceo]
//   agent:pause     --company=<slug> --agent=<agentId>
//   agent:resume    --company=<slug> --agent=<agentId>
//   agent:list      --company=<slug>
//   agent:run       --company=<slug> [--agent=<agentId>]
//   scheduler:start --company=<slug>
//   scheduler:stop  --company=<slug>
//   scheduler:status --company=<slug>
//   secret:set      --company=<slug> --key=<KEY> --value=<value>
//   secret:list     --company=<slug>

import { prisma } from "../lib/db/client";
import { upsertSecret } from "../lib/db/secrets";
import { registerRepo, listRepos, syncRepoLabels } from "../lib/repos/repo-service";
import path from "path";

// ─────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────

function parseArgs() {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      flags[key] = val ?? true;
    } else {
      positional.push(arg);
    }
  }

  return { command: positional[0], flags };
}

function flag(flags: Record<string, string | boolean>, key: string): string {
  const val = flags[key];
  if (!val || typeof val !== "string") {
    console.error(`[CLI] Flag --${key} é obrigatória.`);
    process.exit(1);
  }
  return val;
}

function optFlag(flags: Record<string, string | boolean>, key: string, defaultVal = ""): string {
  const val = flags[key];
  return typeof val === "string" ? val : defaultVal;
}

// ─────────────────────────────────────────────
// Tenant Commands
// ─────────────────────────────────────────────

async function tenantCreate(flags: Record<string, string | boolean>) {
  const name = flag(flags, "name");
  const slug = flag(flags, "slug");
  const token = flag(flags, "token");
  const owner = flag(flags, "owner");
  const repo = flag(flags, "repo");
  const webhookSecret = crypto.randomUUID();

  const company = await prisma.company.create({
    data: { name, slug, githubToken: token, githubOwner: owner, repoName: repo, webhookSecret },
  });

  console.log(`✅ Tenant criado com sucesso!`);
  console.log(`   ID:             ${company.id}`);
  console.log(`   Slug:           ${company.slug}`);
  console.log(`   Webhook Secret: ${company.webhookSecret}`);
  console.log(`   GitHub:         ${owner}/${repo}`);
}

async function tenantList() {
  const companies = await prisma.company.findMany({
    include: { schedulers: { orderBy: { updatedAt: "desc" }, take: 1 } },
  });

  if (companies.length === 0) {
    console.log("Nenhum tenant cadastrado.");
    return;
  }

  for (const c of companies) {
    const sched = c.schedulers[0];
    const status = sched?.status ?? "STOPPED";
    const icon = status === "RUNNING" ? "🟢" : "🔴";
    console.log(`${icon} [${c.slug}] ${c.name}  (${c.githubOwner}/${c.repoName})`);
  }
}

// ─────────────────────────────────────────────
// Company Commands (V4 — with prefix and CEO)
// ─────────────────────────────────────────────

async function companyCreate(flags: Record<string, string | boolean>) {
  const name = flag(flags, "name");
  const slug = flag(flags, "slug");
  const prefix = flag(flags, "prefix");
  const token = flag(flags, "token");
  const owner = flag(flags, "owner");
  const mission = optFlag(flags, "mission", `Empresa ${name}`);
  const webhookSecret = crypto.randomUUID();
  const repoName = `${prefix}org`;

  // 1. Criar no banco local
  const company = await prisma.company.create({
    data: {
      name,
      slug,
      repoPrefix: prefix,
      githubToken: token,
      githubOwner: owner,
      repoName,
      webhookSecret,
      mission,
    },
  });

  console.log(`✅ Empresa "${name}" criada!`);
  console.log(`   Slug:       ${slug}`);
  console.log(`   Prefix:     ${prefix}`);
  console.log(`   Repo:       ${owner}/${repoName}`);

  // 2. Criar repositório no GitHub
  const { Octokit } = await import("octokit");
  const octokit = new Octokit({ auth: token });

  try {
    await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      description: `Organograma da empresa ${name} — GitCompany-AI (BaaC)`,
      private: true,
      auto_init: false,
    });
    console.log(`   ✅ Repositório ${owner}/${repoName} criado no GitHub.`);
  } catch (err: any) {
    if (err.status === 422) {
      console.log(`   ⚠️  Repositório ${owner}/${repoName} já existe.`);
    } else {
      throw err;
    }
  }

  // 3. Commit inicial do business.json com CEO
  const businessJson: any = {
    companyName: name,
    mission,
    version: "1.0",
    agents: [
      {
        agentId: "ceo",
        role: "CEO",
        llm: { provider: "openai", model: "gpt-4o" },
        context: `Você é o CEO da empresa "${name}". Sua missão: ${mission}. Você pode delegar tarefas e "contratar" novos agentes subordinados conforme necessidade. Ao identificar uma necessidade operacional, crie uma Issue propondo a contratação de um novo agente com role, context e labels definidos.`,
        tickIntervalSeconds: 3600,
        labels: ["ceo", "strategic"],
        subordinates: [],
      },
    ],
    infrastructure: {
      labels: [
        { name: "ceo", color: "D4AF37", description: "Tarefas do CEO" },
        { name: "strategic", color: "6f42c1", description: "Decisões estratégicas" },
        { name: "hiring", color: "0e8a16", description: "Contratação de agentes" },
      ],
      milestones: [],
      project: { title: `${name} — Board`, views: [{ name: "Kanban", layout: "BOARD" }] },
      workflows: [],
    },
    orgChart: {
      ceo: { agentId: "ceo", role: "CEO", context: mission, subordinates: [] },
      departments: {},
    },
  };

  const content = Buffer.from(JSON.stringify(businessJson, null, 2)).toString("base64");

  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path: "business.json",
      message: "Initial BaaC: business.json with CEO agent",
      content,
    });
    console.log(`   ✅ business.json commitado com CEO.`);
  } catch (err: any) {
    console.error(`   ❌ Erro ao commitar business.json:`, err.message);
  }

  // 4. Configurar webhook
  try {
    await octokit.rest.repos.createWebhook({
      owner,
      repo: repoName,
      config: {
        url: `${process.env.WEBHOOK_BASE_URL ?? "http://localhost:3000"}/api/webhook/${slug}`,
        content_type: "json",
        secret: webhookSecret,
      },
      events: ["push", "issues", "issue_comment", "pull_request"],
    });
    console.log(`   ✅ Webhook configurado.`);
  } catch (err: any) {
    console.warn(`   ⚠️  Webhook: ${err.message}`);
  }

  console.log(`\n🎉 Empresa pronta! Use "agent:add" para adicionar agentes ao CEO.`);
}

async function companySync(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const direction = flag(flags, "direction") as "push" | "pull";

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Empresa não encontrada."); process.exit(1); }

  const { Octokit } = await import("octokit");
  const octokit = new Octokit({ auth: company.githubToken });

  if (direction === "pull") {
    // Download business.json from remote repo
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: company.githubOwner,
        repo: company.repoName,
        path: "business.json",
      });
      if (!Array.isArray(data) && data.type === "file") {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        const config = JSON.parse(content);
        // Update local company mission
        await prisma.company.update({
          where: { id: company.id },
          data: { mission: config.mission ?? company.mission },
        });
        console.log(`✅ Pull: business.json sincronizado do repo para o local.`);
        console.log(`   Agents no repo: ${config.agents?.length ?? 0}`);
      }
    } catch (err: any) {
      console.error(`❌ Erro no pull:`, err.message);
    }
  } else if (direction === "push") {
    // Build business.json from local DB and push to repo
    const agents = await prisma.agentConfig.findMany({
      where: { companyId: company.id },
      include: { provider: true },
    });

    const businessJson = {
      companyName: company.name,
      mission: company.mission,
      version: "1.0",
      agents: agents.map((a) => ({
        agentId: a.agentId,
        role: a.role,
        llm: {
          provider: a.provider.type,
          model: a.model,
          apiKey: `{{${a.provider.type.toUpperCase()}_API_KEY}}`,
        },
        context: a.context,
        tickIntervalSeconds: a.tickIntervalSeconds,
        labels: a.labels.split(",").map((l) => l.trim()).filter(Boolean),
        subordinates: a.subordinates.split(",").map((s) => s.trim()).filter(Boolean),
      })),
      infrastructure: { labels: [], milestones: [], project: { title: `${company.name} — Board`, views: [] }, workflows: [] },
      orgChart: buildOrgChart(agents),
    };

    const content = Buffer.from(JSON.stringify(businessJson, null, 2)).toString("base64");

    // Get current SHA if file exists
    let sha: string | undefined;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: company.githubOwner,
        repo: company.repoName,
        path: "business.json",
      });
      if (!Array.isArray(data) && data.type === "file") {
        sha = data.sha;
      }
    } catch { /* file doesn't exist yet */ }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: company.githubOwner,
      repo: company.repoName,
      path: "business.json",
      message: "Sync: update business.json from local config",
      content,
      sha,
    });

    console.log(`✅ Push: business.json enviado para ${company.githubOwner}/${company.repoName}.`);
  }
}

function buildOrgChart(agents: any[]) {
  const ceoAgent = agents.find((a) => a.isCeo);
  const orgChart: any = {
    ceo: ceoAgent
      ? { agentId: ceoAgent.agentId, role: ceoAgent.role, context: ceoAgent.context, subordinates: ceoAgent.subordinates.split(",").filter(Boolean) }
      : null,
    departments: {},
  };
  return orgChart;
}

// ─────────────────────────────────────────────
// Provider Commands
// ─────────────────────────────────────────────

async function providerList() {
  const providers = await prisma.aIProvider.findMany({ orderBy: { name: "asc" } });
  if (providers.length === 0) { console.log("Nenhum provider configurado. Use db:seed."); return; }

  console.log("Providers de IA disponíveis:\n");
  for (const p of providers) {
    const local = p.isLocal ? " (LOCAL)" : "";
    const url = p.baseUrl ? ` → ${p.baseUrl}` : "";
    console.log(`  [${p.slug}] ${p.name}${local}${url}`);
  }
}

async function providerAdd(flags: Record<string, string | boolean>) {
  const name = flag(flags, "name");
  const slug = flag(flags, "slug");
  const type = flag(flags, "type");
  const baseUrl = optFlag(flags, "baseUrl") || null;
  const isLocal = flags["local"] === true;

  await prisma.aIProvider.create({ data: { name, slug, type, baseUrl, isLocal } });
  console.log(`✅ Provider "${name}" adicionado.`);
}

// ─────────────────────────────────────────────
// Agent Commands
// ─────────────────────────────────────────────

async function agentAdd(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const agentId = flag(flags, "agentId");
  const role = flag(flags, "role");
  const providerSlug = flag(flags, "provider");
  const model = flag(flags, "model");
  const context = flag(flags, "context");
  const interval = parseInt(optFlag(flags, "interval", "300"), 10);
  const labels = optFlag(flags, "labels", "");
  const isCeo = flags["ceo"] === true;

  if (interval < 300) {
    console.error("❌ Intervalo mínimo é 300 segundos (5 minutos).");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Empresa não encontrada."); process.exit(1); }

  const provider = await prisma.aIProvider.findUnique({ where: { slug: providerSlug } });
  if (!provider) { console.error(`Provider "${providerSlug}" não encontrado. Use provider:list.`); process.exit(1); }

  await prisma.agentConfig.upsert({
    where: { companyId_agentId: { companyId: company.id, agentId } },
    update: { role, context, providerId: provider.id, model, tickIntervalSeconds: interval, labels, isCeo },
    create: {
      companyId: company.id,
      agentId,
      role,
      context,
      providerId: provider.id,
      model,
      tickIntervalSeconds: interval,
      labels,
      isCeo,
    },
  });

  console.log(`✅ Agent "${agentId}" (${role}) configurado para "${companySlug}".`);
}

async function agentPause(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const agentId = flag(flags, "agent");

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Empresa não encontrada."); process.exit(1); }

  const result = await prisma.agentConfig.updateMany({
    where: { companyId: company.id, agentId },
    data: { isPaused: true },
  });

  if (result.count === 0) { console.error(`Agent "${agentId}" não encontrado.`); process.exit(1); }
  console.log(`⏸️  Agent "${agentId}" PAUSADO. Configs mantidas.`);
}

async function agentResume(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const agentId = flag(flags, "agent");

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Empresa não encontrada."); process.exit(1); }

  const result = await prisma.agentConfig.updateMany({
    where: { companyId: company.id, agentId },
    data: { isPaused: false },
  });

  if (result.count === 0) { console.error(`Agent "${agentId}" não encontrado.`); process.exit(1); }
  console.log(`▶️  Agent "${agentId}" RETOMADO.`);
}

async function agentList(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Empresa não encontrada."); process.exit(1); }

  const agents = await prisma.agentConfig.findMany({
    where: { companyId: company.id },
    include: { provider: true },
    orderBy: { createdAt: "asc" },
  });

  if (agents.length === 0) { console.log("Nenhum agente configurado."); return; }

  console.log(`Agentes de "${company.name}":\n`);
  for (const a of agents) {
    const status = a.isPaused ? "⏸️  PAUSADO" : "▶️  ATIVO";
    const ceo = a.isCeo ? " 👑" : "";
    console.log(`  ${status} [${a.agentId}] ${a.role}${ceo}`);
    console.log(`       Provider: ${a.provider.name} (${a.model})`);
    console.log(`       Interval: ${a.tickIntervalSeconds}s | Labels: ${a.labels || "—"}`);
    console.log();
  }
}

// ─────────────────────────────────────────────
// Scheduler Commands
// ─────────────────────────────────────────────

async function schedulerStart(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const schedulerPath = path.join(process.cwd(), "scheduler", "index.ts");
  const proc = Bun.spawn(["bun", "run", schedulerPath, `--company=${companySlug}`], {
    detached: true,
    stdout: "inherit",
    stderr: "inherit",
  });
  proc.unref();
  console.log(`✅ Scheduler iniciado para "${companySlug}" (PID: ${proc.pid})`);
}

async function schedulerStop(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Tenant não encontrado."); process.exit(1); }

  const sched = await prisma.schedulerProcess.findFirst({
    where: { companyId: company.id, status: "RUNNING" },
    orderBy: { updatedAt: "desc" },
  });

  if (!sched?.pid) { console.log(`Scheduler já está parado.`); return; }

  try {
    process.kill(sched.pid, "SIGTERM");
    await prisma.schedulerProcess.update({
      where: { id: sched.id },
      data: { status: "STOPPED", stoppedAt: new Date(), pid: null },
    });
    console.log(`✅ Scheduler encerrado (PID ${sched.pid}).`);
  } catch { console.error(`Não foi possível encerrar o PID ${sched.pid}.`); }
}

async function schedulerStatus(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Tenant não encontrado."); process.exit(1); }

  const sched = await prisma.schedulerProcess.findFirst({
    where: { companyId: company.id },
    orderBy: { updatedAt: "desc" },
  });

  const status = sched?.status ?? "STOPPED";
  const icon = status === "RUNNING" ? "🟢" : "🔴";
  console.log(`${icon} Scheduler "${companySlug}": ${status}`);
  if (sched?.pid) console.log(`   PID: ${sched.pid}`);
}

// ─────────────────────────────────────────────
// Agent Run (one-shot)
// ─────────────────────────────────────────────

async function agentRun(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const agentId = flags["agent"] as string | undefined;

  const schedulerPath = path.join(process.cwd(), "scheduler", "index.ts");
  const args = ["bun", "run", schedulerPath, `--company=${companySlug}`, "--run-now"];
  if (agentId) args.push(`--agent=${agentId}`);

  console.log(`🚀 Disparando agentes para "${companySlug}"...`);
  const proc = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  await proc.exited;
  console.log("✅ Execução concluída.");
}

// ─────────────────────────────────────────────
// Secret Commands
// ─────────────────────────────────────────────

async function secretSet(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const key = flag(flags, "key");
  const value = flag(flags, "value");

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Tenant não encontrado."); process.exit(1); }

  await upsertSecret(company.id, key, value);
  console.log(`✅ Secret "{{${key}}}" salvo para "${companySlug}".`);
}

async function secretList(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Tenant não encontrado."); process.exit(1); }

  const secrets = await prisma.companySecret.findMany({ where: { companyId: company.id } });
  if (secrets.length === 0) { console.log("Nenhum secret cadastrado."); return; }

  for (const s of secrets) {
    console.log(`  {{${s.key}}}  →  ${"*".repeat(8)} (${s.value.length} chars)`);
  }
}

// ─────────────────────────────────────────────
// Repo Commands
// ─────────────────────────────────────────────

async function repoRegister(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");
  const shortId = flag(flags, "shortId");
  const description = optFlag(flags, "description", "");
  const createOnGitHub = flags["create"] === true;
  const fullNameOverride = optFlag(flags, "fullName") || undefined;

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Empresa não encontrada."); process.exit(1); }

  const result = await registerRepo({
    companyId: company.id,
    shortId,
    fullName: fullNameOverride,
    description,
    createOnGitHub,
  });

  console.log(`✅ Repo registrado!`);
  console.log(`   Short ID:  ${result.shortId}`);
  console.log(`   Full Name: ${result.fullName}`);
  console.log(`   Label:     ${result.label}`);
  if (createOnGitHub) console.log(`   GitHub:    ${company.githubOwner}/${result.fullName}`);
}

async function repoList(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Empresa não encontrada."); process.exit(1); }

  const repos = await listRepos(company.id);

  if (repos.length === 0) { console.log("Nenhum repo registrado."); return; }

  console.log(`Repos de "${company.name}" (prefix: ${company.repoPrefix}):\n`);
  for (const r of repos) {
    console.log(`  [${r.label}] ${company.githubOwner}/${r.fullName}`);
    if (r.description) console.log(`       ${r.description}`);
    console.log();
  }
}

async function repoSync(flags: Record<string, string | boolean>) {
  const companySlug = flag(flags, "company");

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) { console.error("Empresa não encontrada."); process.exit(1); }

  await syncRepoLabels(company.id);
  console.log(`✅ Labels de repo sincronizadas no repositório ${company.githubOwner}/${company.repoName}.`);
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────

async function main() {
  const { command, flags } = parseArgs();

  const commands: Record<string, (f: typeof flags) => Promise<void>> = {
    "tenant:create": tenantCreate,
    "tenant:list": tenantList,
    "company:create": companyCreate,
    "company:sync": companySync,
    "provider:list": providerList,
    "provider:add": providerAdd,
    "repo:register": repoRegister,
    "repo:list": repoList,
    "repo:sync": repoSync,
    "agent:add": agentAdd,
    "agent:pause": agentPause,
    "agent:resume": agentResume,
    "agent:list": agentList,
    "agent:run": agentRun,
    "scheduler:start": schedulerStart,
    "scheduler:stop": schedulerStop,
    "scheduler:status": schedulerStatus,
    "secret:set": secretSet,
    "secret:list": secretList,
  };

  if (!command || !(command in commands)) {
    console.log("GitCompany-AI CLI\n");
    console.log("Comandos disponíveis:");
    Object.keys(commands).forEach((c) => console.log(`  bun run cli/tenant.ts ${c}`));
    process.exit(0);
  }

  await commands[command](flags);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[CLI] Erro:", err.message);
  process.exit(1);
});
