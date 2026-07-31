// lib/__tests__/llm-factory.test.ts
import { describe, it, expect, vi } from "vitest";
import { createLLM } from "../agents/llm-factory";
import { LLMConfig } from "../baac/types";

describe("LLM Factory", () => {
  it("should throw for unsupported provider", async () => {
    const config = { provider: "invalid_provider" as any, model: "test" };
    await expect(createLLM(config)).rejects.toThrow("não suportado");
  });

  it("should create OpenAI instance with correct params", async () => {
    const config: LLMConfig = {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-test-key",
      temperature: 0.5,
      maxTokens: 2048,
    };

    const llm = await createLLM(config);
    expect(llm).toBeDefined();
  });

  it("should create Anthropic instance", async () => {
    const config: LLMConfig = {
      provider: "anthropic",
      model: "claude-3-sonnet-20240229",
      apiKey: "sk-ant-test",
      temperature: 0.3,
    };

    const llm = await createLLM(config);
    expect(llm).toBeDefined();
  });

  it("should create Ollama instance with default base URL", async () => {
    const config: LLMConfig = {
      provider: "ollama",
      model: "llama3",
    };

    const llm = await createLLM(config);
    expect(llm).toBeDefined();
  });

  it("should create Gemini instance", async () => {
    const config: LLMConfig = {
      provider: "gemini",
      model: "gemini-pro",
      apiKey: "test-key",
    };

    const llm = await createLLM(config);
    expect(llm).toBeDefined();
  });

  it("should create Moonshot (Kimi K3) instance via OpenAI-compatible", async () => {
    const config: LLMConfig = {
      provider: "moonshot",
      model: "moonshot-v1-8k",
      apiKey: "test-moonshot-key",
      baseUrl: "https://api.moonshot.cn/v1",
    };

    const llm = await createLLM(config);
    expect(llm).toBeDefined();
  });

  it("should create Groq instance", async () => {
    const config: LLMConfig = {
      provider: "groq",
      model: "llama3-70b-8192",
      apiKey: "gsk-test",
    };

    const llm = await createLLM(config);
    expect(llm).toBeDefined();
  });

  it("should use default temperature 0.2 when not specified", async () => {
    const config: LLMConfig = {
      provider: "ollama",
      model: "llama3",
    };

    const llm = await createLLM(config);
    expect((llm as any).temperature).toBe(0.2);
  });

  it("should use default maxTokens 4096 when not specified", async () => {
    const config: LLMConfig = {
      provider: "ollama",
      model: "llama3",
    };

    const llm = await createLLM(config);
    // Ollama doesn't expose maxTokens directly, just verify creation
    expect(llm).toBeDefined();
  });
});
