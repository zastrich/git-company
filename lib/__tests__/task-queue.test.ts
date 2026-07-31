// lib/__tests__/task-queue.test.ts
import { describe, it, expect } from "vitest";
import { isIssueBlocked, getPendingBlockers } from "../agents/task-queue";
import { IssueContext } from "../baac/types";

describe("Task Queue - isIssueBlocked", () => {
  it("should return false when no blockers", () => {
    const issue: IssueContext = {
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
    expect(isIssueBlocked(issue)).toBe(false);
  });

  it("should return false when all blockers are closed", () => {
    const issue: IssueContext = {
      number: 1,
      title: "Test",
      body: "",
      state: "open",
      url: "",
      labels: [],
      assignees: [],
      parent: null,
      blockedBy: [
        { number: 2, title: "Done", state: "closed", url: "" },
        { number: 3, title: "Also done", state: "closed", url: "" },
      ],
      blocking: [],
    };
    expect(isIssueBlocked(issue)).toBe(false);
  });

  it("should return true when at least one blocker is open", () => {
    const issue: IssueContext = {
      number: 1,
      title: "Test",
      body: "",
      state: "open",
      url: "",
      labels: [],
      assignees: [],
      parent: null,
      blockedBy: [
        { number: 2, title: "Done", state: "closed", url: "" },
        { number: 3, title: "Still pending", state: "open", url: "" },
      ],
      blocking: [],
    };
    expect(isIssueBlocked(issue)).toBe(true);
  });
});

describe("Task Queue - getPendingBlockers", () => {
  it("should return empty array when no blockers", () => {
    const issue: IssueContext = {
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
    expect(getPendingBlockers(issue)).toEqual([]);
  });

  it("should return only open blocker numbers", () => {
    const issue: IssueContext = {
      number: 1,
      title: "Test",
      body: "",
      state: "open",
      url: "",
      labels: [],
      assignees: [],
      parent: null,
      blockedBy: [
        { number: 5, title: "Closed", state: "closed", url: "" },
        { number: 7, title: "Open", state: "open", url: "" },
        { number: 9, title: "Also open", state: "open", url: "" },
      ],
      blocking: [],
    };
    expect(getPendingBlockers(issue)).toEqual([7, 9]);
  });
});
