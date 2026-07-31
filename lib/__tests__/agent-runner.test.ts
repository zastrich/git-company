// lib/__tests__/agent-runner.test.ts
import { describe, it, expect } from "vitest";
import { toAgentDefinition } from "../scheduler/agent-runner";

describe("Agent Runner - toAgentDefinition", () => {
  const mockProvider = {
    id: "provider-1",
    name: "OpenAI",
    slug: "openai",
    type: "openai",
    baseUrl: null,
    isLocal: false,
    createdAt: new Date(),
  };

  const mockAgentConfig = {
    id: "agent-1",
    companyId: "company-1",
    agentId: "dev-agent",
    role: "Backend Developer",
    context: "You handle backend tasks",
    providerId: "provider-1",
    provider: mockProvider,
    model: "gpt-4o",
    temperature: 0.3,
    maxTokens: 2048,
    tickIntervalSeconds: 600,
    labels: "backend,api,database",
    subordinates: "junior-dev,intern",
    isPaused: false,
    isCeo: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const secrets = new Map([["OPENAI_API_KEY", "sk-test-123"]]);

  it("should convert AgentConfig to AgentDefinition", () => {
    const result = toAgentDefinition(mockAgentConfig as any, secrets);

    expect(result.agentId).toBe("dev-agent");
    expect(result.role).toBe("Backend Developer");
    expect(result.context).toBe("You handle backend tasks");
    expect(result.tickIntervalSeconds).toBe(600);
  });

  it("should parse labels from comma-separated string", () => {
    const result = toAgentDefinition(mockAgentConfig as any, secrets);
    expect(result.labels).toEqual(["backend", "api", "database"]);
  });

  it("should parse subordinates from comma-separated string", () => {
    const result = toAgentDefinition(mockAgentConfig as any, secrets);
    expect(result.subordinates).toEqual(["junior-dev", "intern"]);
  });

  it("should resolve API key from secrets", () => {
    const result = toAgentDefinition(mockAgentConfig as any, secrets);
    expect(result.llm.apiKey).toBe("sk-test-123");
  });

  it("should handle empty labels", () => {
    const config = { ...mockAgentConfig, labels: "" };
    const result = toAgentDefinition(config as any, secrets);
    expect(result.labels).toEqual([]);
  });

  it("should handle empty subordinates", () => {
    const config = { ...mockAgentConfig, subordinates: "" };
    const result = toAgentDefinition(config as any, secrets);
    // When empty string is split and filtered, result may be undefined or empty array
    expect(result.subordinates ?? []).toEqual([]);
  });

  it("should use provider baseUrl for ollama", () => {
    const ollamaProvider = { ...mockProvider, type: "ollama", baseUrl: "http://localhost:11434" };
    const config = { ...mockAgentConfig, provider: ollamaProvider };
    const result = toAgentDefinition(config as any, new Map());
    expect(result.llm.baseUrl).toBe("http://localhost:11434");
    expect(result.llm.apiKey).toBeUndefined();
  });

  it("should set correct LLM config values", () => {
    const result = toAgentDefinition(mockAgentConfig as any, secrets);
    expect(result.llm.provider).toBe("openai");
    expect(result.llm.model).toBe("gpt-4o");
    expect(result.llm.temperature).toBe(0.3);
    expect(result.llm.maxTokens).toBe(2048);
  });
});
