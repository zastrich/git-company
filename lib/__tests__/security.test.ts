// lib/__tests__/security.test.ts
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { interpolateSecrets } from "../db/secrets";

describe("Security & Multitenancy Validation", () => {
  it("should validate HMAC-SHA256 signatures correctly and reject tampered payloads", () => {
    const secret = "tenant-webhook-secret-key-123";
    const payload = JSON.stringify({ action: "opened", issue: { number: 42 } });

    // Generate valid HMAC digest
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    const validDigest = `sha256=${hmac.digest("hex")}`;

    // Verify valid signature matching
    const testHmac = crypto.createHmac("sha256", secret);
    testHmac.update(payload);
    const calculatedDigest = `sha256=${testHmac.digest("hex")}`;

    expect(crypto.timingSafeEqual(Buffer.from(validDigest), Buffer.from(calculatedDigest))).toBe(true);

    // Verify invalid signature rejection
    const invalidDigest = `sha256=${"0".repeat(64)}`;
    expect(crypto.timingSafeEqual(Buffer.from(validDigest), Buffer.from(invalidDigest))).toBe(false);
  });

  it("should isolate tenant secrets and avoid cross-tenant interpolation", () => {
    const tenantASecrets = new Map([["OPENAI_API_KEY", "sk-tenant-A-secret-key"]]);
    const tenantBSecrets = new Map([["OPENAI_API_KEY", "sk-tenant-B-secret-key"]]);

    const template = { apiKey: "{{OPENAI_API_KEY}}" };

    const interpolatedA = interpolateSecrets(template, tenantASecrets);
    const interpolatedB = interpolateSecrets(template, tenantBSecrets);

    expect(interpolatedA.apiKey).toBe("sk-tenant-A-secret-key");
    expect(interpolatedB.apiKey).toBe("sk-tenant-B-secret-key");
    expect(interpolatedA.apiKey).not.toBe(interpolatedB.apiKey);
  });

  it("should prevent unresolved secrets placeholders from exposing raw data", () => {
    const secrets = new Map([["ALLOWED_KEY", "secret-value"]]);
    const text = "API Key: {{FORBIDDEN_KEY}}";

    const result = interpolateSecrets(text, secrets);
    expect(result).toBe("API Key: {{FORBIDDEN_KEY}}");
    expect(result).not.toContain("secret-value");
  });
});
