// lib/agents/llm-factory.ts
//
// Factory de LLMs — Single Responsibility: criar instâncias de chat model
// a partir de uma configuração declarativa (LLMConfig).
//
// Providers suportados:
//   - openai     (ChatGPT, GPT-4o, etc.)
//   - anthropic  (Claude)
//   - gemini     (Google Gemini)
//   - bedrock    (AWS Bedrock — Claude, Titan, Llama via AWS)
//   - moonshot   (Kimi K3 — compatível com OpenAI API)
//   - ollama     (modelos locais)
//   - groq       (inferência rápida)

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMConfig } from "../baac/types";

/**
 * Cria a instância de LLM correta do LangChain
 * baseada no `provider` definido na config do agente.
 */
export async function createLLM(config: LLMConfig): Promise<BaseChatModel> {
  const temperature = config.temperature ?? 0.2;
  const maxTokens = config.maxTokens ?? 4096;

  switch (config.provider) {
    case "openai": {
      const { ChatOpenAI } = await import("@langchain/openai");
      return new ChatOpenAI({
        model: config.model,
        temperature,
        maxTokens,
        apiKey: config.apiKey,
        configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
      });
    }

    case "anthropic": {
      const { ChatAnthropic } = await import("@langchain/anthropic");
      return new ChatAnthropic({
        model: config.model,
        temperature,
        maxTokens,
        anthropicApiKey: config.apiKey,
      });
    }

    case "gemini": {
      const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
      return new ChatGoogleGenerativeAI({
        model: config.model,
        temperature,
        maxOutputTokens: maxTokens,
        apiKey: config.apiKey,
      });
    }

    case "bedrock": {
      const { ChatBedrockConverse } = await import("@langchain/aws");
      return new ChatBedrockConverse({
        model: config.model,
        temperature,
        maxTokens,
        region: config.baseUrl ?? "us-east-1",
        credentials: config.apiKey
          ? {
              accessKeyId: config.apiKey.split(":")[0] ?? "",
              secretAccessKey: config.apiKey.split(":")[1] ?? "",
            }
          : undefined,
      });
    }

    case "moonshot": {
      // Kimi K3 (Moonshot AI) expõe uma API compatível com OpenAI.
      // Basta usar ChatOpenAI com baseUrl customizada.
      const { ChatOpenAI } = await import("@langchain/openai");
      return new ChatOpenAI({
        model: config.model,
        temperature,
        maxTokens,
        apiKey: config.apiKey,
        configuration: {
          baseURL: config.baseUrl ?? "https://api.moonshot.cn/v1",
        },
      });
    }

    case "ollama": {
      const { ChatOllama } = await import("@langchain/ollama");
      return new ChatOllama({
        model: config.model,
        baseUrl: config.baseUrl ?? "http://localhost:11434",
        temperature,
      });
    }

    case "groq": {
      const { ChatGroq } = await import("@langchain/groq");
      return new ChatGroq({
        model: config.model,
        temperature,
        maxTokens,
        apiKey: config.apiKey,
      });
    }

    case "local": {
      // LLM local determinística — sem rede, sem API key.
      // Serve para iniciar o Organizador Pessoal e testar o fluxo de chat.
      const { LocalChatModel } = await import("./local-llm");
      return new LocalChatModel({ model: config.model || "local-organizer-v1" });
    }

    case "custom": {
      // Provider genérico: qualquer API compatível com OpenAI (local ou online).
      // Ex: NVIDIA NIM (https://integrate.api.nvidia.com/v1), LM Studio, vLLM, etc.
      // Requer baseUrl e (geralmente) apiKey.
      if (!config.baseUrl) {
        throw new Error(
          `[LLMFactory] Provider "custom" requer baseUrl (endpoint OpenAI-compatible).`
        );
      }
      const { ChatOpenAI } = await import("@langchain/openai");
      return new ChatOpenAI({
        model: config.model,
        temperature,
        maxTokens,
        apiKey: config.apiKey ?? "not-needed",
        configuration: { baseURL: config.baseUrl },
      });
    }

    case "kiro-cli": {
      // Kiro via CLI: executa o binário `kiro chat` como subprocesso,
      // autenticando com o token via KIRO_API_KEY no ambiente.
      const { KiroCliChatModel } = await import("./kiro-cli-llm");
      return new KiroCliChatModel({
        model: config.model || "kiro-cli",
        apiKey: config.apiKey,
        // baseUrl é reaproveitada como caminho do binário, se informado.
        binPath: config.baseUrl || "kiro",
      });
    }

    default: {
      const exhaustive: never = config.provider;
      throw new Error(
        `[LLMFactory] Provider "${exhaustive}" não suportado. ` +
          `Providers disponíveis: openai, anthropic, gemini, bedrock, moonshot, ollama, groq`
      );
    }
  }
}
