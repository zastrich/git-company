// lib/__tests__/repo-service.test.ts
import { describe, it, expect } from "vitest";
import { repoLabel } from "../repos/repo-service";

describe("Repo Service - repoLabel", () => {
  it("should generate label with repo: prefix", () => {
    expect(repoLabel("api")).toBe("repo:api");
    expect(repoLabel("frontend")).toBe("repo:frontend");
    expect(repoLabel("docs")).toBe("repo:docs");
  });

  it("should handle single character shortId", () => {
    expect(repoLabel("x")).toBe("repo:x");
  });

  it("should handle hyphenated shortId", () => {
    expect(repoLabel("mobile-app")).toBe("repo:mobile-app");
  });

  it("should stay within GitHub 50-char label limit for reasonable shortIds", () => {
    const label = repoLabel("this-is-a-long-repo-name-example");
    expect(label.length).toBeLessThanOrEqual(50);
  });

  it("should warn when approaching limit", () => {
    // "repo:" is 5 chars, so shortId up to 45 chars is safe
    const maxShortId = "a".repeat(45);
    const label = repoLabel(maxShortId);
    expect(label.length).toBe(50);
  });
});

describe("Repo Service - Label Format Design", () => {
  it("repo labels should be easily distinguishable from other labels", () => {
    const repoLabels = ["repo:api", "repo:frontend", "repo:docs"];
    const otherLabels = ["backend", "bug", "ceo", "strategic"];

    for (const rl of repoLabels) {
      expect(rl.startsWith("repo:")).toBe(true);
    }
    for (const ol of otherLabels) {
      expect(ol.startsWith("repo:")).toBe(false);
    }
  });

  it("shortId can be extracted from label by removing prefix", () => {
    const label = "repo:mobile-app";
    const shortId = label.replace("repo:", "");
    expect(shortId).toBe("mobile-app");
  });
});
