// lib/__tests__/secrets.test.ts
import { describe, it, expect } from "vitest";
import { interpolateSecrets } from "../db/secrets";

describe("Secrets - interpolateSecrets", () => {
  const secrets = new Map([
    ["OPENAI_API_KEY", "sk-real-key-123"],
    ["GITHUB_TOKEN", "ghp_abcdef"],
    ["DB_PASSWORD", "s3cur3!"],
  ]);

  it("should replace single placeholder in string", () => {
    const result = interpolateSecrets("key={{OPENAI_API_KEY}}", secrets);
    expect(result).toBe("key=sk-real-key-123");
  });

  it("should replace multiple placeholders in string", () => {
    const result = interpolateSecrets("{{OPENAI_API_KEY}} and {{GITHUB_TOKEN}}", secrets);
    expect(result).toBe("sk-real-key-123 and ghp_abcdef");
  });

  it("should leave unresolved placeholders untouched", () => {
    const result = interpolateSecrets("{{UNKNOWN_KEY}}", secrets);
    expect(result).toBe("{{UNKNOWN_KEY}}");
  });

  it("should handle string without placeholders", () => {
    const result = interpolateSecrets("no placeholders here", secrets);
    expect(result).toBe("no placeholders here");
  });

  it("should recursively interpolate objects", () => {
    const config = {
      apiKey: "{{OPENAI_API_KEY}}",
      nested: {
        token: "{{GITHUB_TOKEN}}",
        plain: "hello",
      },
    };

    const result = interpolateSecrets(config, secrets);
    expect(result.apiKey).toBe("sk-real-key-123");
    expect(result.nested.token).toBe("ghp_abcdef");
    expect(result.nested.plain).toBe("hello");
  });

  it("should recursively interpolate arrays", () => {
    const config = ["{{OPENAI_API_KEY}}", "static", "{{DB_PASSWORD}}"];
    const result = interpolateSecrets(config, secrets);
    expect(result).toEqual(["sk-real-key-123", "static", "s3cur3!"]);
  });

  it("should handle null and undefined values", () => {
    expect(interpolateSecrets(null, secrets)).toBeNull();
    expect(interpolateSecrets(undefined, secrets)).toBeUndefined();
  });

  it("should handle numbers and booleans without modification", () => {
    expect(interpolateSecrets(42, secrets)).toBe(42);
    expect(interpolateSecrets(true, secrets)).toBe(true);
  });

  it("should handle empty map gracefully", () => {
    const emptySecrets = new Map<string, string>();
    const result = interpolateSecrets("{{OPENAI_API_KEY}}", emptySecrets);
    expect(result).toBe("{{OPENAI_API_KEY}}");
  });
});
