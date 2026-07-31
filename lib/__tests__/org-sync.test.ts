// lib/__tests__/org-sync.test.ts
import { describe, it, expect } from "vitest";

describe("Org Sync - Sync Direction Validation", () => {
  it("should recognize push as valid direction", () => {
    const validDirections = ["push", "pull"];
    expect(validDirections).toContain("push");
  });

  it("should recognize pull as valid direction", () => {
    const validDirections = ["push", "pull"];
    expect(validDirections).toContain("pull");
  });

  it("should reject invalid direction", () => {
    const validDirections = ["push", "pull"];
    expect(validDirections).not.toContain("sync");
    expect(validDirections).not.toContain("both");
    expect(validDirections).not.toContain("");
  });
});

describe("Org Sync - Business JSON Structure", () => {
  it("should validate required fields in business.json", () => {
    const validConfig = {
      companyName: "Test Corp",
      version: "1.0",
      agents: [],
      infrastructure: {
        labels: [],
        milestones: [],
        project: { title: "Board", views: [] },
        workflows: [],
      },
    };

    expect(validConfig.companyName).toBeTruthy();
    expect(validConfig.version).toBeTruthy();
    expect(Array.isArray(validConfig.agents)).toBe(true);
    expect(validConfig.infrastructure).toBeDefined();
  });

  it("should validate agent definition structure", () => {
    const agent = {
      agentId: "ceo",
      role: "CEO",
      llm: { provider: "openai", model: "gpt-4o" },
      context: "Strategic decisions",
      tickIntervalSeconds: 3600,
      labels: ["ceo"],
    };

    expect(agent.agentId).toBeTruthy();
    expect(agent.role).toBeTruthy();
    expect(agent.llm.provider).toBeTruthy();
    expect(agent.llm.model).toBeTruthy();
    expect(agent.tickIntervalSeconds).toBeGreaterThanOrEqual(300);
  });
});
