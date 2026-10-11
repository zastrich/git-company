// lib/__tests__/factory.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { buildContextBlock, runAgent } from "../agents/factory";
import { IssueContext, AgentDefinition } from "../baac/types";

// Mock da factory de LLM para não exigir rede/API key nos testes.
const invokeMock = vi.fn();
const bindToolsMock = vi.fn();

vi.mock("../agents/llm-factory", () => ({
  createLLM: vi.fn(async () => ({
    invoke: invokeMock,
    bindTools: bindToolsMock,
  })),
}));

describe("Agent Factory - buildContextBlock", () => {
  const baseIssue: IssueContext = {
    number: 42,
    title: "Implement login feature",
    body: "Create OAuth2 login flow",
    state: "open",
    url: "https://github.com/org/repo/issues/42",
    labels: ["backend", "auth"],
    assignees: ["dev-agent"],
    parent: null,
    blockedBy: [],
    blocking: [],
  };

  it("should include issue number and title", () => {
    const result = buildContextBlock(baseIssue);
    expect(result).toContain("#42");
    expect(result).toContain("Implement login feature");
  });

  it("should include issue body", () => {
    const result = buildContextBlock(baseIssue);
    expect(result).toContain("Create OAuth2 login flow");
  });

  it("should include labels", () => {
    const result = buildContextBlock(baseIssue);
    expect(result).toContain("backend, auth");
  });

  it("should include assignees", () => {
    const result = buildContextBlock(baseIssue);
    expect(result).toContain("dev-agent");
  });

  it("should show parent when present", () => {
    const issueWithParent: IssueContext = {
      ...baseIssue,
      parent: {
        number: 10,
        title: "Epic: Auth System",
        state: "open",
        url: "https://github.com/org/repo/issues/10",
      },
    };
    const result = buildContextBlock(issueWithParent);
    expect(result).toContain("TAREFA PAI");
    expect(result).toContain("#10");
    expect(result).toContain("Epic: Auth System");
  });

  it("should show blockedBy dependencies", () => {
    const issueBlocked: IssueContext = {
      ...baseIssue,
      blockedBy: [
        { number: 5, title: "Setup DB", state: "open", url: "" },
        { number: 6, title: "Create schema", state: "closed", url: "" },
      ],
    };
    const result = buildContextBlock(issueBlocked);
    expect(result).toContain("DEPENDÊNCIAS");
    expect(result).toContain("#5");
    expect(result).toContain("PENDENTE");
    expect(result).toContain("#6");
    expect(result).toContain("RESOLVIDA");
  });

  it("should show blocking issues", () => {
    const issueBlocking: IssueContext = {
      ...baseIssue,
      blocking: [
        { number: 99, title: "Deploy to prod", state: "open", url: "" },
      ],
    };
    const result = buildContextBlock(issueBlocking);
    expect(result).toContain("ESTA TAREFA BLOQUEIA");
    expect(result).toContain("#99");
  });

  it("should handle empty body", () => {
    const issueNoBody: IssueContext = { ...baseIssue, body: "" };
    const result = buildContextBlock(issueNoBody);
    expect(result).toContain("(sem descrição)");
  });
});

describe("Agent Factory - runAgent tool_calls", () => {
  const agentDef: AgentDefinition = {
    agentId: "dev-agent",
    role: "Desenvolvedor",
    type: "ai",
    llm: { provider: "openai", model: "gpt-4o", apiKey: "test" },
    context: "Escreve código.",
    tickIntervalSeconds: 60,
    labels: ["backend"],
  };

  const issue: IssueContext = {
    number: 42,
    title: "Implement login feature",
    body: "Create OAuth2 login flow",
    state: "open",
    url: "https://github.com/org/repo/issues/42",
    labels: ["backend"],
    assignees: ["dev-agent"],
    parent: null,
    blockedBy: [],
    blocking: [],
  };

  beforeEach(() => {
    invokeMock.mockReset();
    bindToolsMock.mockReset();
    // bindTools retorna um "modelo vinculado" com seu próprio invoke.
    bindToolsMock.mockReturnValue({ invoke: invokeMock });
  });

  it("surfaces tool_calls and rawMessage when the model emits tool calls", async () => {
    const aiMessage = new AIMessage({
      content: "Vou acessar a agenda.",
      tool_calls: [
        {
          id: "call_1",
          name: "create_event",
          args: { date: "2024-01-07T14:00:00", title: "Reunião" },
        },
      ],
    });
    invokeMock.mockResolvedValue(aiMessage);

    const fakeTool = { name: "create_event" } as never;
    const result = await runAgent(agentDef, {
      issueContext: issue,
      tools: [fakeTool],
    });

    // Vinculou as ferramentas e usou o modelo vinculado.
    expect(bindToolsMock).toHaveBeenCalledTimes(1);
    expect(result.response).toBe("Vou acessar a agenda.");
    expect(result.toolCalls).toEqual([
      {
        id: "call_1",
        name: "create_event",
        args: { date: "2024-01-07T14:00:00", title: "Reunião" },
      },
    ]);
    expect(result.rawMessage).toBe(aiMessage);
  });

  it("returns undefined toolCalls and plain response when no tools are bound", async () => {
    const aiMessage = new AIMessage({ content: "Tarefa concluída. [TAREFA_CONCLUÍDA]" });
    invokeMock.mockResolvedValue(aiMessage);

    const result = await runAgent(agentDef, { issueContext: issue });

    // Sem ferramentas: bindTools nunca é chamado (llmToUse === llm).
    expect(bindToolsMock).not.toHaveBeenCalled();
    expect(result.toolCalls).toBeUndefined();
    expect(result.response).toBe("Tarefa concluída. [TAREFA_CONCLUÍDA]");
  });
});
