// lib/__tests__/orchestrator.test.ts
import { describe, it, expect } from "vitest";
import { resolveAgentForIssue } from "../agents/orchestrator";
import { AgentDefinition, IssueContext } from "../baac/types";

describe("Orchestrator - resolveAgentForIssue", () => {
  const agents: AgentDefinition[] = [
    {
      agentId: "backend-dev",
      role: "Backend Developer",
      llm: { provider: "openai", model: "gpt-4o" },
      context: "Backend development",
      tickIntervalSeconds: 300,
      labels: ["backend", "api"],
    },
    {
      agentId: "frontend-dev",
      role: "Frontend Developer",
      llm: { provider: "openai", model: "gpt-4o" },
      context: "Frontend development",
      tickIntervalSeconds: 300,
      labels: ["frontend", "ui"],
    },
    {
      agentId: "ceo",
      role: "CEO",
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
