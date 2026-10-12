// lib/agents/factory.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { AgentDefinition, IssueContext, McpServerConfig } from "../baac/types";
import { createLLM } from "./llm-factory";
import { assembleAgentContext } from "./context-loader";

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
  /** Ferramentas (incluindo MCP) disponibilizadas à LLM via bindTools. */
  tools?: StructuredToolInterface[];
  /** MCP Servers que originaram as `tools` (para rastreamento/orquestração). */
  mcpServers?: McpServerConfig[];
  /** Mensagens anteriores da conversa, prefixadas ao prompt quando presentes. */
  priorMessages?: BaseMessage[];
}

export interface AgentRunResult {
  agentId: string;
  role: string;
  response: string;
  /** Tool calls emitidas pela LLM (quando há ferramentas vinculadas). */
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  /** Mensagem bruta da LLM (preserva metadados de tool_calls). */
  rawMessage?: AIMessage;
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

  const contextBlock = buildContextBlock(input.issueContext, input.stageRules, input.currentStage);

  // Contexto montado em camadas (descrição curta + contexto longo: markdown
  // do banco, convenção agents/<id>.md e arquivos .md). Sem nenhum contexto
  // longo, retorna agentDef.context inalterado — comportamento preservado.
  const assembledContext = assembleAgentContext(agentDef);

  const formatted = await prompt.formatMessages({
    role: agentDef.role,
    agentContext: assembledContext,
    contextBlock,
  });

  // Monta a sequência final da conversa. `formatted` = [SystemMessage,
  // HumanMessage(context)]; `priorMessages` traz o histórico acumulado pelo
  // loop agêntico (AIMessage com tool_calls + ToolMessages), SEM system/human.
  // O SystemMessage DEVE ser o primeiro e único — Gemini e outros provedores
  // estritos rejeitam com "System message should be the first one" caso o
  // histórico seja prefixado antes dele. Por isso: [...formatted, ...prior].
  const messages: BaseMessage[] =
    input.priorMessages && input.priorMessages.length > 0
      ? [...formatted, ...input.priorMessages]
      : formatted;

  // Sem ferramentas, llmToUse === llm — caminho preservado 1:1.
  // bindTools é opcional no tipo BaseChatModel, mas todos os chat models
  // suportados o implementam (ver llm-factory).
  const llmToUse =
    input.tools?.length && llm.bindTools
      ? llm.bindTools(input.tools)
      : llm;

  const rawMessage = (await llmToUse.invoke(messages)) as AIMessage;

  // Deriva a string de resposta a partir de content (string ou content-parts),
  // reproduzindo o que o StringOutputParser produzia.
  const response = extractText(rawMessage.content);

  const toolCalls =
    rawMessage.tool_calls && rawMessage.tool_calls.length > 0
      ? rawMessage.tool_calls.map((tc) => ({
          id: tc.id ?? "",
          name: tc.name,
          args: tc.args as Record<string, unknown>,
        }))
      : undefined;

  return {
    agentId: agentDef.agentId,
    role: agentDef.role,
    response,
    toolCalls,
    rawMessage,
  };
}

/**
 * Extrai texto do campo `content` de uma AIMessage, aceitando string simples
 * ou um array de content-parts (multimodal). Reproduz o comportamento do
 * antigo StringOutputParser para o caminho sem ferramentas.
 */
function extractText(content: AIMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}
