// lib/__tests__/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { resolveAgentForIssue, runAgentCycle } from "../agents/orchestrator";
import { AgentDefinition, BusinessConfig, IssueContext } from "../baac/types";

// ── Mocks (hoisted) ──
const runAgentMock = vi.fn();
const createCommentMock = vi.fn();
const getContentMock = vi.fn();
const issuesUpdateMock = vi.fn();
const getAvailableTasksMock = vi.fn();
const connectMcpServerMock = vi.fn();
const executeMcpToolCallMock = vi.fn();
const getSecretsMock = vi.fn();
const createAuditLogMock = vi.fn();
const auditCreateMock = vi.fn();

vi.mock("../agents/factory", () => ({
  runAgent: (...args: unknown[]) => runAgentMock(...args),
}));

vi.mock("../agents/task-queue", () => ({
  getAvailableTasksForAgent: (...args: unknown[]) => getAvailableTasksMock(...args),
}));

vi.mock("../agents/mcp-client", () => ({
  connectMcpServer: (...args: unknown[]) => connectMcpServerMock(...args),
}));

vi.mock("../agents/mcp-executor", () => ({
  executeMcpToolCall: (...args: unknown[]) => executeMcpToolCallMock(...args),
}));

vi.mock("../db/secrets", () => ({
  getSecrets: (...args: unknown[]) => getSecretsMock(...args),
  interpolateSecrets: (config: unknown) => config,
}));

vi.mock("../db/audit", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLogMock(...args),
}));

vi.mock("../db/client", () => ({
  prisma: {
    auditLog: { create: (...args: unknown[]) => auditCreateMock(...args) },
  },
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    rest = {
      issues: {
        createComment: (...args: unknown[]) => createCommentMock(...args),
        update: (...args: unknown[]) => issuesUpdateMock(...args),
      },
      repos: {
        getContent: (...args: unknown[]) => getContentMock(...args),
      },
    };
  },
}));

describe("Orchestrator - resolveAgentForIssue", () => {
  const agents: AgentDefinition[] = [
    {
      agentId: "backend-dev",
      role: "Backend Developer",
      type: "ai",
      llm: { provider: "openai", model: "gpt-4o" },
      context: "Backend development",
      tickIntervalSeconds: 300,
      labels: ["backend", "api"],
    },
    {
      agentId: "frontend-dev",
      role: "Frontend Developer",
      type: "ai",
      llm: { provider: "openai", model: "gpt-4o" },
      context: "Frontend development",
      tickIntervalSeconds: 300,
      labels: ["frontend", "ui"],
    },
    {
      agentId: "ceo",
      role: "CEO",
      type: "ai",
      llm: { provider: "anthropic", model: "claude-3-sonnet" },
      context: "Strategic decisions",
      tickIntervalSeconds: 3600,
      labels: ["strategic", "ceo"],
    },
  ];

  const baseIssue: IssueContext = {
    number: 1,
    title: "Test",
    body: "",
    state: "open",
    url: "",
    labels: [],
    assignees: [],
    parent: null,
    blockedBy: [],
    blocking: [],
  };

  it("should resolve agent by matching label", () => {
    const issue = { ...baseIssue, labels: ["backend"] };
    const result = resolveAgentForIssue(issue, agents);
    expect(result?.agentId).toBe("backend-dev");
  });

  it("should resolve frontend agent", () => {
    const issue = { ...baseIssue, labels: ["ui", "design"] };
    const result = resolveAgentForIssue(issue, agents);
    expect(result?.agentId).toBe("frontend-dev");
  });

  it("should return null when no labels match", () => {
    const issue = { ...baseIssue, labels: ["devops", "infra"] };
    const result = resolveAgentForIssue(issue, agents);
    expect(result).toBeNull();
  });

  it("should be case-insensitive", () => {
    const issue = { ...baseIssue, labels: ["BACKEND"] };
    const result = resolveAgentForIssue(issue, agents);
    expect(result?.agentId).toBe("backend-dev");
  });

  it("should return first matching agent when multiple match", () => {
    const issue = { ...baseIssue, labels: ["backend", "frontend"] };
    const result = resolveAgentForIssue(issue, agents);
    // First agent that matches wins
    expect(result?.agentId).toBe("backend-dev");
  });

  it("should handle empty agents list", () => {
    const issue = { ...baseIssue, labels: ["backend"] };
    const result = resolveAgentForIssue(issue, []);
    expect(result).toBeNull();
  });

  it("should handle empty issue labels", () => {
    const issue = { ...baseIssue, labels: [] };
    const result = resolveAgentForIssue(issue, agents);
    expect(result).toBeNull();
  });
});

describe("Orchestrator - runAgentCycle agentic loop", () => {
  const config = {} as BusinessConfig;

  const issue: IssueContext = {
    number: 42,
    title: "Crie uma agenda no próximo domingo às 14h",
    body: "Agendar reunião",
    state: "open",
    url: "https://github.com/org/repo/issues/42",
    labels: ["agenda"],
    assignees: [],
    parent: null,
    blockedBy: [],
    blocking: [],
  };

  beforeEach(() => {
    runAgentMock.mockReset();
    createCommentMock.mockReset().mockResolvedValue({});
    getContentMock.mockReset().mockRejectedValue(new Error("no workflow.json"));
    issuesUpdateMock.mockReset().mockResolvedValue({});
    getAvailableTasksMock.mockReset();
    connectMcpServerMock.mockReset();
    executeMcpToolCallMock.mockReset();
    getSecretsMock.mockReset().mockResolvedValue(new Map());
    createAuditLogMock.mockReset().mockResolvedValue({});
    auditCreateMock.mockReset().mockResolvedValue({});
  });

  it("runs the loop: tool_calls on iteration 1, final response on iteration 2", async () => {
    const mcpAgent: AgentDefinition = {
      agentId: "scheduler",
      role: "Agendador",
      type: "ai",
      llm: { provider: "openai", model: "gpt-4o" },
      context: "Agenda tarefas",
      tickIntervalSeconds: 60,
      labels: ["agenda"],
      mcpServers: [
        {
          id: "gcal",
          name: "Google Agenda",
          transport: "sse",
          url: "https://example.com/mcp",
        },
      ],
    };

    getAvailableTasksMock.mockResolvedValue([
      { issue, agentDef: mcpAgent, isBlocked: false, pendingBlockers: [] },
    ]);

    // Conexão MCP mockada expõe uma ferramenta "create_event".
    const connection = {
      serverId: "gcal",
      serverName: "Google Agenda",
      listTools: vi.fn().mockResolvedValue([
        { name: "create_event", description: "Cria evento", inputSchema: { type: "object", properties: {} } },
      ]),
      callTool: vi.fn(),
      disconnect: vi.fn().mockResolvedValue(undefined),
    };
    connectMcpServerMock.mockResolvedValue(connection);

    executeMcpToolCallMock.mockResolvedValue({
      success: true,
      serverId: "gcal",
      serverName: "Google Agenda",
      toolName: "create_event",
      result: { status: 200, message: "created" },
      durationMs: 10,
    });

    // Iteração 1: LLM pede a ferramenta. Iteração 2: resposta final.
    runAgentMock
      .mockResolvedValueOnce({
        agentId: "scheduler",
        role: "Agendador",
        response: "Vou acessar a agenda.",
        toolCalls: [{ id: "call_1", name: "create_event", args: { date: "2024-01-07T14:00:00" } }],
        rawMessage: new AIMessage({ content: "Vou acessar a agenda." }),
      })
      .mockResolvedValueOnce({
        agentId: "scheduler",
        role: "Agendador",
        response: "Agenda criada com sucesso. [TAREFA_CONCLUÍDA]",
        toolCalls: undefined,
      });

    const result = await runAgentCycle(mcpAgent, config, "company-1", "token", "org", "repo");

    // runAgent chamado 2x (uma por iteração até a resposta final).
    expect(runAgentMock).toHaveBeenCalledTimes(2);
    // executeMcpToolCall chamado uma vez para a tool_call.
    expect(executeMcpToolCallMock).toHaveBeenCalledTimes(1);

    // Comentários postados: 1 "Acessando" + 1 "Resultado" + 1 final = 3.
    expect(createCommentMock).toHaveBeenCalledTimes(3);
    const bodies = createCommentMock.mock.calls.map((c) => (c[0] as { body: string }).body);
    expect(bodies.some((b) => b.includes("🔌") && b.includes("Google Agenda"))).toBe(true);
    expect(bodies.some((b) => b.includes("📋") && b.includes("created"))).toBe(true);
    expect(bodies.some((b) => b.includes("🤖") && b.includes("Agenda criada com sucesso"))).toBe(true);

    // Conexão desconectada no finally.
    expect(connection.disconnect).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(1);
  });

  it("non-MCP agent posts exactly one comment and runs the loop once", async () => {
    const plainAgent: AgentDefinition = {
      agentId: "writer",
      role: "Redator",
      type: "ai",
      llm: { provider: "openai", model: "gpt-4o" },
      context: "Escreve textos",
      tickIntervalSeconds: 60,
      labels: ["agenda"],
      // sem mcpServers
    };

    getAvailableTasksMock.mockResolvedValue([
      { issue, agentDef: plainAgent, isBlocked: false, pendingBlockers: [] },
    ]);

    runAgentMock.mockResolvedValue({
      agentId: "writer",
      role: "Redator",
      response: "Pronto. [TAREFA_CONCLUÍDA]",
      toolCalls: undefined,
    });

    const result = await runAgentCycle(plainAgent, config, "company-1", "token", "org", "repo");

    expect(runAgentMock).toHaveBeenCalledTimes(1);
    expect(connectMcpServerMock).not.toHaveBeenCalled();
    expect(executeMcpToolCallMock).not.toHaveBeenCalled();
    // Exatamente um comentário (a resposta do agente).
    expect(createCommentMock).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(1);
  });

  it("logs MCP_CONNECTION_ERROR and continues when a server fails to connect", async () => {
    const mcpAgent: AgentDefinition = {
      agentId: "scheduler",
      role: "Agendador",
      type: "ai",
      llm: { provider: "openai", model: "gpt-4o" },
      context: "Agenda tarefas",
      tickIntervalSeconds: 60,
      labels: ["agenda"],
      mcpServers: [
        { id: "gcal", name: "Google Agenda", transport: "sse", url: "https://example.com/mcp" },
      ],
    };

    getAvailableTasksMock.mockResolvedValue([
      { issue, agentDef: mcpAgent, isBlocked: false, pendingBlockers: [] },
    ]);

    connectMcpServerMock.mockRejectedValue(new Error("connection refused"));

    runAgentMock.mockResolvedValue({
      agentId: "scheduler",
      role: "Agendador",
      response: "Não consegui acessar a agenda. [TAREFA_CONCLUÍDA]",
      toolCalls: undefined,
    });

    const result = await runAgentCycle(mcpAgent, config, "company-1", "token", "org", "repo");

    expect(createAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "MCP_CONNECTION_ERROR" })
    );
    // Prossegue sem o servidor: uma resposta final postada.
    expect(createCommentMock).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(1);
  });
});
