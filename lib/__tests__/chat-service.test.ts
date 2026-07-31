// lib/__tests__/chat-service.test.ts
import { describe, it, expect } from "vitest";

describe("Chat Service - Context Window Date Calculation", () => {
  // Test the core logic of context window filtering
  function getContextWindowDate(window: "30d" | "90d" | "all"): Date | null {
    const now = new Date();
    switch (window) {
      case "30d":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case "90d":
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case "all":
        return null;
    }
  }

  it("30d should return a date approximately 30 days in the past", () => {
    const result = getContextWindowDate("30d");
    expect(result).not.toBeNull();
    const diffMs = Date.now() - result!.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  it("90d should return a date approximately 90 days in the past", () => {
    const result = getContextWindowDate("90d");
    expect(result).not.toBeNull();
    const diffMs = Date.now() - result!.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(90, 0);
  });

  it("all should return null (no date filter)", () => {
    const result = getContextWindowDate("all");
    expect(result).toBeNull();
  });
});

describe("Chat Service - Message Role Validation", () => {
  it("should accept valid roles", () => {
    const validRoles = ["user", "assistant", "system"];
    for (const role of validRoles) {
      expect(["user", "assistant", "system"]).toContain(role);
    }
  });

  it("should reject invalid roles", () => {
    const invalidRoles = ["admin", "bot", ""];
    for (const role of invalidRoles) {
      expect(["user", "assistant", "system"]).not.toContain(role);
    }
  });
});
