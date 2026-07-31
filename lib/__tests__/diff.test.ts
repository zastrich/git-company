// lib/__tests__/diff.test.ts
import { describe, it, expect, vi } from "vitest";
import { BusinessConfig } from "../baac/types";

// Mock the external dependencies properly as classes
vi.mock("../github/rest", () => ({
  GitHubRestClient: class {
    syncLabels = vi.fn().mockResolvedValue(undefined);
    syncMilestones = vi.fn().mockResolvedValue(undefined);
    syncWorkflows = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("../github/graphql", () => ({
  GitHubGraphQLClient: class {
    syncProjectViews = vi.fn().mockResolvedValue(undefined);
  },
}));

describe("BaaC Diff Engine", () => {
  it("should instantiate with token, owner, and repo", async () => {
    const { BaaCDiffEngine } = await import("../baac/diff");
    const engine = new BaaCDiffEngine("token", "owner", "repo");
    expect(engine).toBeDefined();
  });

  it("should sync infrastructure with labels", async () => {
    const { BaaCDiffEngine } = await import("../baac/diff");
    const engine = new BaaCDiffEngine("token", "owner", "repo");
    const config: BusinessConfig = {
      companyName: "Test Corp",
      version: "1.0",
      agents: [],
      infrastructure: {
        labels: [{ name: "bug", color: "d73a4a", description: "Something broken" }],
        milestones: [],
        project: { title: "Test", views: [] },
        workflows: [],
      },
    };

    await expect(engine.syncInfrastructure(config)).resolves.not.toThrow();
  });

  it("should sync infrastructure with milestones", async () => {
    const { BaaCDiffEngine } = await import("../baac/diff");
    const engine = new BaaCDiffEngine("token", "owner", "repo");
    const config: BusinessConfig = {
      companyName: "Test Corp",
      version: "1.0",
      agents: [],
      infrastructure: {
        labels: [],
        milestones: [{ title: "Sprint 1", description: "First sprint", due_on: "2025-01-31" }],
        project: { title: "Test", views: [] },
        workflows: [],
      },
    };

    await expect(engine.syncInfrastructure(config)).resolves.not.toThrow();
  });

  it("should sync infrastructure with workflows", async () => {
    const { BaaCDiffEngine } = await import("../baac/diff");
    const engine = new BaaCDiffEngine("token", "owner", "repo");
    const config: BusinessConfig = {
      companyName: "Test Corp",
      version: "1.0",
      agents: [],
      infrastructure: {
        labels: [],
        milestones: [],
        project: { title: "Test", views: [] },
        workflows: [{ file: "ci.yml", content: "name: CI\non: push" }],
      },
    };

    await expect(engine.syncInfrastructure(config)).resolves.not.toThrow();
  });

  it("should skip empty arrays without errors", async () => {
    const { BaaCDiffEngine } = await import("../baac/diff");
    const engine = new BaaCDiffEngine("token", "owner", "repo");
    const config: BusinessConfig = {
      companyName: "Test Corp",
      version: "1.0",
      agents: [],
      infrastructure: {
        labels: [],
        milestones: [],
        project: { title: "Test", views: [] },
        workflows: [],
      },
    };

    await expect(engine.syncInfrastructure(config)).resolves.not.toThrow();
  });
});
