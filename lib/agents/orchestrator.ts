// lib/agents/orchestrator.ts
import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { BusinessConfig, AgentDefinition, IssueContext, McpServerConfig } from "../baac/types";
import { runAgent } from "./factory";
import { getAvailableTasksForAgent, QueuedTask } from "./task-queue";
import { connectMcpServer, McpConnection, McpToolSchema } from "./mcp-client";
import { executeMcpToolCall } from "./mcp-executor";
import { getSecrets, interpolateSecrets } from "../db/secrets";
import { createAuditLog } from "../db/audit";
import { prisma } from "../db/client";

/** Número máximo de iterações do loop agêntico (chamada LLM -> MCP -> LLM). */
const MAX_ITERATIONS = 5;

export interface OrchestratorRunResult {
  agentId: string;
  processed: number;
  blocked: number;
  errors: number;
}

/**
 * Resolve qual agente é responsável por uma Issue específica
 * baseado nas labels da issue vs labels dos agentes no business.json.
 */
export function resolveAgentForIssue(
  issue: IssueContext,
  agents: AgentDefinition[]
): AgentDefinition | null {
  const issueLabelSet = new Set(issue.labels.map((l) => l.toLowerCase()));

  for (const agent of agents) {
    const hasMatchingLabel = agent.labels.some((label) =>
      issueLabelSet.has(label.toLowerCase())
    );
    if (hasMatchingLabel) return agent;
  }

  return null;
}

/**
 * Converte as ferramentas expostas por uma conexão MCP em ferramentas
 * LangChain, para que a LLM possa enxergá-las (nome + descrição + schema)
 * ao fazer bindTools. A `func` é um placeholder: a execução real NÃO passa
 * por aqui, mas sim por executeMcpToolCall (auditado). O retorno também
 * registra, no mapa fornecido, qual conexão é dona de cada ferramenta,
 * para o loop resolver a origem de cada tool_call.
 */
function convertMcpToolsToLangChain(
  tools: McpToolSchema[],
  conn: McpConnection,
  toolToConnection: Map<string, McpConnection>
): StructuredToolInterface[] {
  return tools.map((t) => {
    toolToConnection.set(t.name, conn);
    return new DynamicStructuredTool({
      name: t.name,
      description: t.description ?? "",
      // O inputSchema MCP é um JSON Schema — aceito diretamente pela tool.
      schema: (t.inputSchema ?? { type: "object", properties: {} }) as never,
      // Placeholder: a execução real acontece via executeMcpToolCall.
      func: async () => "",
    }) as unknown as StructuredToolInterface;
  });
}

/**
 * Executa o ciclo de trabalho de um agente específico:
 * 1. Busca Issues com suas labels
 * 2. Filtra bloqueadas por dependências
 * 3. Executa as desbloqueadas e posta comentários no GitHub
 * 4. Registra no AuditLog
 */
export async function runAgentCycle(
  agentDef: AgentDefinition,
  config: BusinessConfig,
  companyId: string,
  token: string,
  owner: string,
  repo: string
): Promise<OrchestratorRunResult> {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token });

  const tasks: QueuedTask[] = await getAvailableTasksForAgent(
    agentDef,
    token,
    owner,
    repo
  );

  // Carrega as regras de todas as etapas (workflow.json) uma vez por ciclo.
  let stageRules: any[] = [];
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path: "workflow.json" });
    if (!Array.isArray(data) && (data as any).type === "file") {
      const wf = JSON.parse(Buffer.from((data as any).content, "base64").toString("utf-8"));
      stageRules = wf.stages ?? [];
    }
  } catch { /* sem workflow.json — segue sem regras */ }

  const STAGE_PREFIX = "stage::";
  const currentStageOf = (labels: string[]) => {
    const l = labels.find((x) => x.startsWith(STAGE_PREFIX));
    return l ? l.slice(STAGE_PREFIX.length) : undefined;
  };

  let processed = 0;
  let blocked = 0;
  let errors = 0;

  for (const task of tasks) {
    if (task.isBlocked) {
      blocked++;
      console.log(
        `[Orchestrator] Issue #${task.issue.number} BLOQUEADA por: #${task.pendingBlockers.join(", #")}`
      );

      await prisma.auditLog.create({
        data: {
          companyId,
          agentId: agentDef.agentId,
          agentName: agentDef.role,
          action: "TASK_BLOCKED",
          details: JSON.stringify({
            issueNumber: task.issue.number,
            issueTitle: task.issue.title,
            pendingBlockers: task.pendingBlockers,
          }),
        },
      });
      continue;
    }

    // Conexões MCP abertas para esta tarefa — desconectadas no finally.
    const connections: McpConnection[] = [];

    try {
      console.log(
        `[Orchestrator] Agent "${agentDef.agentId}" processando Issue #${task.issue.number}: ${task.issue.title}`
      );

      // ── Conectar MCP Servers declarados (segredos resolvidos) ──
      // Degradação graciosa: falha em um server loga MCP_CONNECTION_ERROR e segue.
      const tools: StructuredToolInterface[] = [];
      const toolToConnection = new Map<string, McpConnection>();

      if (agentDef.mcpServers && agentDef.mcpServers.length > 0) {
        const secrets = await getSecrets(companyId);
        for (const serverConfig of agentDef.mcpServers) {
          try {
            const resolved = interpolateSecrets(serverConfig, secrets);
            const resolvedEnv = (resolved.env ?? {}) as Record<string, string>;
            const conn = await connectMcpServer(resolved, resolvedEnv);
            connections.push(conn);
            const mcpTools = await conn.listTools();
            tools.push(...convertMcpToolsToLangChain(mcpTools, conn, toolToConnection));
          } catch (connErr: any) {
            console.error(
              `[Orchestrator] Falha ao conectar MCP Server "${serverConfig.id}":`,
              connErr?.message
            );
            await createAuditLog({
              companyId,
              agentId: agentDef.agentId,
              agentName: agentDef.role,
              action: "MCP_CONNECTION_ERROR",
              details: {
                issueNumber: task.issue.number,
                serverId: serverConfig.id,
                serverName: serverConfig.name,
                error: connErr instanceof Error ? connErr.message : String(connErr),
              },
            });
            // Continua sem este servidor.
          }
        }
      }

      // ── Loop agêntico (máx. MAX_ITERATIONS) ──
      // Sem MCP: tools=[], o loop roda exatamente uma vez e posta um comentário.
      const messages: BaseMessage[] = [];
      const currentStage = currentStageOf(task.issue.labels);
      let finalResponse = "";

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const result = await runAgent(agentDef, {
          issueContext: task.issue,
          stageRules,
          currentStage,
          tools,
          priorMessages: messages,
        });

        // Sem tool_calls: resposta final — encerra o loop.
        if (!result.toolCalls || result.toolCalls.length === 0) {
          finalResponse = result.response;
          break;
        }

        // Mantém a mensagem bruta da LLM (preserva metadados de tool_calls).
        if (result.rawMessage) {
          messages.push(result.rawMessage);
        }

        // Executa cada tool_call, com rastreamento na Issue.
        for (const toolCall of result.toolCalls) {
          const conn = toolToConnection.get(toolCall.name);
          const serverName = conn?.serverName ?? "desconhecido";

          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: task.issue.number,
            body: `> 🔌 **${agentDef.role}** (GitCompany-AI)\n\nAcessando ${serverName} via MCP Server (ferramenta: \`${toolCall.name}\`)`,
          });

          let toolContent: string;

          if (!conn) {
            // Ferramenta sem conexão correspondente (servidor caiu/degradou).
            toolContent = JSON.stringify({
              success: false,
              error: `Nenhuma conexão MCP disponível para a ferramenta "${toolCall.name}".`,
            });
          } else {
            const callResult = await executeMcpToolCall({
              connection: conn,
              toolName: toolCall.name,
              args: toolCall.args,
              companyId,
              agentId: agentDef.agentId,
              agentName: agentDef.role,
            });
            toolContent = JSON.stringify(
              callResult.success
                ? { success: true, result: callResult.result }
                : { success: false, error: callResult.error }
            );
          }

          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: task.issue.number,
            body: `> 📋 **${agentDef.role}** (GitCompany-AI)\n\nResultado do MCP Server ${serverName}:\n\n\`\`\`json\n${toolContent}\n\`\`\``,
          });

          // Realimenta o resultado como ToolMessage para a próxima iteração.
          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id,
              content: toolContent,
            })
          );
        }

        // Ao atingir o teto de iterações sem resposta final, usa a última resposta.
        if (iteration === MAX_ITERATIONS - 1) {
          finalResponse = result.response;
        }
      }

      // Postar resposta final como comentário na Issue do GitHub
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: task.issue.number,
        body: `> 🤖 **${agentDef.role}** (GitCompany-AI)\n\n${finalResponse}`,
      });

      // Issue Lifecycle: detectar conclusão e auto-close
      const completionPatterns = ["[TAREFA_CONCLUÍDA]", "[TAREFA_CONCLUIDA]", "[TASK_COMPLETED]"];
      const isCompleted = completionPatterns.some((p) => finalResponse.includes(p));

      if (isCompleted) {
        // Auto-close via GraphQL updateIssue (REST issues.update está deprecated).
        try {
          const { graphql } = await import("@octokit/graphql");
          const gql = graphql.defaults({ headers: { authorization: `token ${token}` } });
          const q: any = await gql(
            `query($owner:String!,$repo:String!,$n:Int!){ repository(owner:$owner,name:$repo){ issue(number:$n){ id } } }`,
            { owner, repo, n: task.issue.number }
          );
          await gql(
            `mutation($id:ID!){ updateIssue(input:{id:$id,state:CLOSED}){ issue { id } } }`,
            { id: q.repository.issue.id }
          );
        } catch {
          // fallback REST (ainda funcional até 2028)
          await octokit.rest.issues.update({ owner, repo, issue_number: task.issue.number, state: "closed", state_reason: "completed" });
        }
        console.log(
          `[Orchestrator] Issue #${task.issue.number} fechada automaticamente (tarefa concluída).`
        );
      }

      processed++;

      // Registrar no AuditLog
      await prisma.auditLog.create({
        data: {
          companyId,
          agentId: agentDef.agentId,
          agentName: agentDef.role,
          action: "TASK_PROCESSED",
          details: JSON.stringify({
            issueNumber: task.issue.number,
            issueTitle: task.issue.title,
            provider: agentDef.llm.provider,
            model: agentDef.llm.model,
            responseLength: finalResponse.length,
          }),
        },
      });
    } catch (error: any) {
      errors++;
      console.error(
        `[Orchestrator] Erro ao processar Issue #${task.issue.number}:`,
        error.message
      );

      await prisma.auditLog.create({
        data: {
          companyId,
          agentId: agentDef.agentId,
          agentName: agentDef.role,
          action: "TASK_ERROR",
          details: JSON.stringify({
            issueNumber: task.issue.number,
            error: error.message,
          }),
        },
      });
    } finally {
      // Desconecta todas as conexões MCP abertas para esta tarefa.
      for (const conn of connections) {
        conn.disconnect().catch(() => {});
      }
    }
  }

  return { agentId: agentDef.agentId, processed, blocked, errors };
}
