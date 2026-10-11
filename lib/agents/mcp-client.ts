// lib/agents/mcp-client.ts
//
// Gerenciador de conexões MCP (Model Context Protocol).
//
// Responsabilidade única: abrir uma conexão com um MCP Server declarado na
// config do agente, listar as ferramentas expostas e permitir a chamada de
// uma ferramenta específica. Suporta os transportes stdio, sse e
// streamable-http.
//
// Os segredos já devem vir resolvidos em `resolvedEnv` (ver interpolateSecrets
// em lib/db/secrets.ts). NUNCA logar valores de segredos aqui.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpServerConfig } from "../baac/types";

/** Esquema de uma ferramenta exposta por um MCP Server. */
export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Conexão viva com um MCP Server. Encapsula o Client do SDK e expõe apenas
 * as operações que o executor precisa.
 */
export interface McpConnection {
  serverId: string;
  serverName: string;
  listTools(): Promise<McpToolSchema[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  disconnect(): Promise<void>;
}

/**
 * Abre uma conexão com o MCP Server descrito por `config`.
 * `resolvedEnv` traz as variáveis de ambiente já com os segredos resolvidos.
 *
 * @throws Error cujo message inclui `config.id` em caso de falha de conexão.
 */
export async function connectMcpServer(
  config: McpServerConfig,
  resolvedEnv: Record<string, string>
): Promise<McpConnection> {
  try {
    let transport: Transport;

    if (config.transport === "stdio") {
      if (!config.command) {
        throw new Error(`transporte stdio requer "command"`);
      }
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...(process.env as Record<string, string>), ...resolvedEnv },
      });
    } else {
      // sse & streamable-http usam o transporte baseado em HTTP/SSE.
      if (!config.url) {
        throw new Error(`transporte ${config.transport} requer "url"`);
      }
      transport = new SSEClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers },
      });
    }

    const client = new Client({
      name: `gitcompany-ai/${config.id}`,
      version: "1.0.0",
    });

    await client.connect(transport);

    return {
      serverId: config.id,
      serverName: config.name,
      async listTools(): Promise<McpToolSchema[]> {
        const result = await client.listTools();
        return result.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown>,
        }));
      },
      async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        const result = await client.callTool({ name, arguments: args });
        return result.content;
      },
      async disconnect(): Promise<void> {
        await client.close();
      },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[MCP] Falha ao conectar ao MCP Server "${config.id}" (${config.name}): ${reason}`
    );
  }
}
