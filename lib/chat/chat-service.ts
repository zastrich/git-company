// lib/chat/chat-service.ts
// Single Responsibility: Manage chat interactions with agents.
// Handles context window filtering, message persistence, and LLM invocation.

import { prisma } from "../db/client";
import { createLLM } from "../agents/llm-factory";
import { providerSecretKey } from "../db/secrets";
import { LLMConfig } from "../baac/types";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

export type ContextWindow = "30d" | "90d" | "all";

export interface ChatRequest {
  companyId: string;
  agentConfigId: string;
  agentId: string;
  message: string;
  contextWindow: ContextWindow;
}

export interface ChatResponse {
  id: string;
  role: "assistant";
  content: string;
  createdAt: Date;
}

/**
 * Retorna a data mínima para filtro de mensagens baseado na janela de contexto.
 */
function getContextWindowDate(window: ContextWindow): Date | null {
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

/**
 * Busca o histórico de mensagens de um agente dentro da janela de contexto.
 */
export async function getChatHistory(
  companyId: string,
  agentConfigId: string,
  contextWindow: ContextWindow,
  limit = 100
) {
  const minDate = getContextWindowDate(contextWindow);

  const where: any = { companyId, agentConfigId };
  if (minDate) {
    where.createdAt = { gte: minDate };
  }

  return prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Envia uma mensagem para um agente e retorna a resposta.
 * Persiste ambas as mensagens (user + assistant) no banco.
 */
export async function sendMessage(request: ChatRequest): Promise<ChatResponse> {
  const { companyId, agentConfigId, agentId, message, contextWindow } = request;

  // 1. Buscar config do agente
  const agentConfig = await prisma.agentConfig.findUnique({
    where: { id: agentConfigId },
    include: { provider: true },
  });

  if (!agentConfig) {
    throw new Error(`Agent config "${agentConfigId}" não encontrado.`);
  }

  if (!agentConfig.provider) {
    throw new Error(`Agente "${agentConfig.agentId}" não possui provider de IA configurado.`);
  }

  // 2. Buscar secrets para resolver API key
  const secrets = await prisma.companySecret.findMany({
    where: { companyId },
    select: { key: true, value: true },
  });
  const secretsMap = new Map(secrets.map((s) => [s.key, s.value]));

  const providerKeyMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    gemini: "GEMINI_API_KEY",
    bedrock: "AWS_BEDROCK_KEY",
    moonshot: "MOONSHOT_API_KEY",
    groq: "GROQ_API_KEY",
    ollama: "",
    local: "",
  };

  // Para providers "custom" (OpenAI-compatible, ex: NVIDIA NIM) e "kiro-cli",
  // a chave é derivada do slug do provider: PROVIDER_<SLUG>_API_KEY. Isso permite
  // N providers sem depender do mapa fixo acima.
  const secretKey =
    agentConfig.provider.type === "custom" || agentConfig.provider.type === "kiro-cli"
      ? providerSecretKey(agentConfig.provider.slug)
      : (providerKeyMap[agentConfig.provider.type] ?? "");
  const apiKey = secretKey ? (secretsMap.get(secretKey) ?? "") : undefined;

  // 3. Criar LLM
  const llmConfig: LLMConfig = {
    provider: agentConfig.provider.type as LLMConfig["provider"],
    model: agentConfig.model,
    apiKey,
    baseUrl: agentConfig.provider.baseUrl ?? undefined,
    temperature: agentConfig.temperature,
    maxTokens: agentConfig.maxTokens,
  };

  const llm = await createLLM(llmConfig);

  // 4. Carregar histórico conforme janela de contexto
  const history = await getChatHistory(companyId, agentConfigId, contextWindow);

  // 5. Montar mensagens para o LLM
  const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
    new SystemMessage(
      `Você é um agente especialista com o papel de **${agentConfig.role}** dentro de uma empresa virtual gerenciada pelo GitCompany-AI.\n\n` +
      `Seu escopo operacional:\n${agentConfig.context}\n\n` +
      `REGRAS:\n` +
      `1. Responda sempre em português do Brasil, de forma objetiva e técnica.\n` +
      `2. Nunca execute ações fora do seu escopo declarado.\n` +
      `3. Se a pergunta não for de sua competência, informe qual agente deve ser consultado.`
    ),
  ];

  // Adicionar histórico
  for (const msg of history) {
    if (msg.role === "user") {
      messages.push(new HumanMessage(msg.content));
    } else if (msg.role === "assistant") {
      messages.push(new AIMessage(msg.content));
    }
  }

  // Adicionar a mensagem atual
  messages.push(new HumanMessage(message));

  // 6. Persistir mensagem do usuário
  await prisma.chatMessage.create({
    data: {
      companyId,
      agentConfigId,
      agentId,
      role: "user",
      content: message,
    },
  });

  // 7. Invocar LLM
  const response = await llm.invoke(messages);
  const responseText = typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);

  // 8. Persistir resposta
  const savedMessage = await prisma.chatMessage.create({
    data: {
      companyId,
      agentConfigId,
      agentId,
      role: "assistant",
      content: responseText,
    },
  });

  return {
    id: savedMessage.id,
    role: "assistant",
    content: responseText,
    createdAt: savedMessage.createdAt,
  };
}
