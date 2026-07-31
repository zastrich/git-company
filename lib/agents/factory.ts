// lib/agents/factory.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { AgentDefinition, IssueContext } from "../baac/types";
import { createLLM } from "./llm-factory";

export interface AgentRunInput {
  issueContext: IssueContext;
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
export function buildContextBlock(issue: IssueContext): string {
  const lines: string[] = [
    `## TAREFA PRINCIPAL: #${issue.number} — ${issue.title}`,
    ``,
    issue.body || "(sem descrição)",
    ``,
    `**Labels:** ${issue.labels.join(", ") || "nenhuma"}`,
    `**Responsáveis:** ${issue.assignees.join(", ") || "não atribuído"}`,
    `**URL:** ${issue.url}`,
  ];

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

  const contextBlock = buildContextBlock(input.issueContext);

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
