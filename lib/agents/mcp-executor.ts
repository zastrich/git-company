// lib/agents/mcp-executor.ts
//
// Executor de uma única chamada de ferramenta MCP, com auditoria.
//
// Cada chamada é rastreada de forma isolada via createAuditLog, identificando
// o agente que a disparou (agentId/agentName) e a empresa (companyId). A
// sequência de eventos é:
//   MCP_CALL_STARTED  -> antes da chamada
//   MCP_CALL_COMPLETED -> em caso de sucesso (com result e durationMs)
//   MCP_CALL_ERROR     -> em caso de erro (SEM re-lançar — degradação graciosa)
//
// NUNCA logar valores de segredos. Os args já chegam resolvidos; evite
// anexar o ambiente/segredos ao details de auditoria.

import { createAuditLog } from "../db/audit";
import { McpConnection } from "./mcp-client";

/** Parâmetros de uma chamada de ferramenta MCP auditada. */
export interface McpCallParams {
  /** Conexão viva com o MCP Server (ver connectMcpServer). */
  connection: McpConnection;
  /** Nome da ferramenta a ser chamada. */
  toolName: string;
  /** Argumentos da ferramenta (já resolvidos). */
  args: Record<string, unknown>;
  /** Empresa dona do agente — para a auditoria. */
  companyId: string;
  /** ID do agente que disparou a chamada. */
  agentId: string;
  /** Nome do agente que disparou a chamada. */
  agentName: string;
}

/** Resultado de uma chamada de ferramenta MCP. */
export interface McpCallResult {
  success: boolean;
  serverId: string;
  serverName: string;
  toolName: string;
  /** Conteúdo retornado pelo MCP Server (apenas em sucesso). */
  result?: unknown;
  /** Mensagem de erro (apenas em falha). */
  error?: string;
  /** Duração da chamada em milissegundos. */
  durationMs: number;
}

/**
 * Executa uma chamada de ferramenta MCP, auditando início, fim e erro.
 * NUNCA re-lança: em caso de erro, retorna { success: false, error }.
 */
export async function executeMcpToolCall(
  params: McpCallParams
): Promise<McpCallResult> {
  const { connection, toolName, args, companyId, agentId, agentName } = params;
  const serverId = connection.serverId;
  const serverName = connection.serverName;

  await createAuditLog({
    companyId,
    agentId,
    agentName,
    action: "MCP_CALL_STARTED",
    details: { server: serverName, serverId, tool: toolName, args },
  });

  const startedAt = Date.now();

  try {
    const result = await connection.callTool(toolName, args);
    const durationMs = Date.now() - startedAt;

    await createAuditLog({
      companyId,
      agentId,
      agentName,
      action: "MCP_CALL_COMPLETED",
      details: { server: serverName, serverId, tool: toolName, result, durationMs },
    });

    return { success: true, serverId, serverName, toolName, result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const error = err instanceof Error ? err.message : String(err);

    await createAuditLog({
      companyId,
      agentId,
      agentName,
      action: "MCP_CALL_ERROR",
      details: { server: serverName, serverId, tool: toolName, error },
    });

    return { success: false, serverId, serverName, toolName, error, durationMs };
  }
}
