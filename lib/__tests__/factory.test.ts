// lib/__tests__/factory.test.ts
import { describe, it, expect } from "vitest";
import { buildContextBlock } from "../agents/factory";
import { IssueContext } from "../baac/types";

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
