// lib/agents/factory.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { AgentDefinition, IssueContext } from "../baac/types";
import { createLLM } from "./llm-factory";

export interface StageRule {
  name: string;
  description?: string;
  input?: string;
  output?: string;
  isManualAction?: boolean;
  isDone?: boolean;
}

export interface AgentRunInput {
  issueContext: IssueContext;
  /** Regras de TODAS as etapas do fluxo (para o agente entender o pipeline). */
  stageRules?: StageRule[];
  /** Nome da etapa atual do card (derivada da label stage::). */
  currentStage?: string;
}

export interface AgentRunResult {
  agentId: string;
  role: string;
  response: string;
}

/**
 * Monta o bloco de texto de contexto completo que o agente recebe,
 * incluindo a tarefa principal, pai, blockers e o que está bloqueando.
 */
export function buildContextBlock(
  issue: IssueContext,
  stageRules?: StageRule[],
  currentStage?: string
): string {
  const lines: string[] = [];

  // Regras do fluxo (todas as etapas) — o agente entende onde está e para onde vai.
  if (stageRules && stageRules.length > 0) {
    lines.push(`## FLUXO DO PROJETO (etapas)`);
    for (const s of stageRules) {
      const marks = [s.isManualAction ? "ação manual" : null, s.isDone ? "final" : null].filter(Boolean).join(", ");
      const here = currentStage && s.name === currentStage ? "  ← ETAPA ATUAL" : "";
      lines.push(`- **${s.name}**${marks ? ` (${marks})` : ""}${here}`);
      if (s.description) lines.push(`  - ${s.description}`);
      if (s.input) lines.push(`  - Input: ${s.input}`);
      if (s.output) lines.push(`  - Output esperado: ${s.output}`);
    }
    lines.push(``, `---`, ``);
  }

  lines.push(
    `## TAREFA PRINCIPAL: #${issue.number} — ${issue.title}`,
    ``,
    issue.body || "(sem descrição)",
    ``,
    `**Etapa atual:** ${currentStage ?? "(indefinida)"}`,
    `**Labels:** ${issue.labels.join(", ") || "nenhuma"}`,
    `**Responsáveis:** ${issue.assignees.join(", ") || "não atribuído"}`,
    `**URL:** ${issue.url}`,
  );

  if (issue.parent) {
    const status = issue.parent.state === "closed" ? "✓ FECHADA" : "⏳ ABERTA";
    lines.push(``, `---`, `### TAREFA PAI`);
    lines.push(`- #${issue.parent.number} — ${issue.parent.title} [${status}]`);
  }

  if (issue.blockedBy.length > 0) {
    lines.push(``, `---`, `### DEPENDÊNCIAS (bloqueada por)`);
    for (const dep of issue.blockedBy) {
      const status = dep.state === "closed" ? "✓ RESOLVIDA" : "⚠️ PENDENTE";
      lines.push(`- #${dep.number} — ${dep.title} [${status}]`);
    }
  }

  if (issue.blocking.length > 0) {
    lines.push(``, `---`, `### ESTA TAREFA BLOQUEIA`);
    for (const dep of issue.blocking) {
      lines.push(`- #${dep.number} — ${dep.title} (aguardando conclusão desta)`);
    }
  }

  return lines.join("\n");
}

/**
 * Instancia e executa um agente para uma Issue específica.
 * O LLM é criado dinamicamente via llm-factory baseado no business.json.
 */
export async function runAgent(
  agentDef: AgentDefinition,
  input: AgentRunInput
): Promise<AgentRunResult> {
  const llm = await createLLM(agentDef.llm);

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `Você é um agente especialista com o papel de **{role}** dentro de uma empresa virtual gerenciada pelo GitCompany-AI.

Seu escopo operacional é estritamente:
{agentContext}

REGRAS ABSOLUTAS:
1. Nunca execute ações fora do seu escopo declarado acima.
2. Responda sempre em português do Brasil, de forma objetiva e técnica.
3. Sua resposta será postada como comentário na Issue do GitHub — use Markdown.
4. Se a tarefa não for de sua competência, informe claramente qual agente/departamento deve ser acionado.
5. Ao concluir a tarefa com sucesso, encerre sua resposta com: [TAREFA_CONCLUÍDA]`,
    ],
    [
      "human",
      `{contextBlock}`,
    ],
  ]);

  const chain = RunnableSequence.from([prompt, llm, new StringOutputParser()]);

  const contextBlock = buildContextBlock(input.issueContext, input.stageRules, input.currentStage);

  const response = await chain.invoke({
    role: agentDef.role,
    agentContext: agentDef.context,
    contextBlock,
  });

  return {
    agentId: agentDef.agentId,
    role: agentDef.role,
    response,
  };
}
