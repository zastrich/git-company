// lib/agents/local-llm.ts
//
// LLM local "básica" — Single Responsibility: fornecer um chat model
// determinístico, sem rede e sem API key, para iniciar o Organizador Pessoal.
//
// Não substitui um provider real (OpenAI, Gemini, etc.); serve como um
// assistente de bootstrap que aplica heurísticas simples de produtividade
// (priorização, quebra de tarefas, blocos de tempo) sobre a mensagem do
// usuário. Isso permite testar o fluxo de chat de ponta a ponta sem custo.

import { SimpleChatModel, type BaseChatModelParams } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";

export interface LocalChatModelParams extends BaseChatModelParams {
  /** Nome do modelo (apenas para telemetria/logs). */
  model?: string;
}

/**
 * Chat model local determinístico. Gera uma resposta de organização pessoal
 * a partir da última mensagem do usuário, sem qualquer chamada externa.
 */
export class LocalChatModel extends SimpleChatModel {
  model: string;

  constructor(params: LocalChatModelParams = {}) {
    super(params);
    this.model = params.model ?? "local-organizer-v1";
  }

  _llmType(): string {
    return "local-organizer";
  }

  async _call(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const lastHuman = [...messages].reverse().find((m) => m._getType() === "human");
    const userText =
      typeof lastHuman?.content === "string"
        ? lastHuman.content
        : JSON.stringify(lastHuman?.content ?? "");

    return buildOrganizerReply(userText);
  }
}

/**
 * Heurística de resposta do Organizador Pessoal.
 * Extrai tarefas da mensagem e devolve uma estrutura de priorização
 * simples (Fazer agora / Agendar / Delegar ou adiar) + um bloco de foco.
 */
export function buildOrganizerReply(userText: string): string {
  const clean = userText.trim();

  if (!clean) {
    return [
      "Sou seu Organizador Pessoal. Me conte o que você precisa fazer hoje e eu ajudo a priorizar.",
      "Exemplo: \"Preciso terminar o relatório, responder emails e estudar para a prova\".",
    ].join("\n");
  }

  // Quebra a entrada em possíveis tarefas por vírgula, "e", ponto e vírgula, ou quebras de linha.
  const tasks = clean
    .split(/\n|;|,| e |\.| então /gi)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);

  const now: string[] = [];
  const schedule: string[] = [];
  const later: string[] = [];

  const urgentHints = /(urgente|hoje|agora|prazo|deadline|entregar|reuni|prova|cliente)/i;
  const laterHints = /(algum dia|quando der|talvez|futuro|ideia|eventualmente|estudar|ler|aprender)/i;

  for (const task of tasks.length ? tasks : [clean]) {
    if (urgentHints.test(task)) now.push(task);
    else if (laterHints.test(task)) later.push(task);
    else schedule.push(task);
  }

  const lines: string[] = [];
  lines.push("Organizei o que você trouxe usando uma matriz simples de prioridade:\n");

  if (now.length) {
    lines.push("**🔴 Fazer agora (urgente + importante):**");
    now.forEach((t) => lines.push(`- ${capitalize(t)}`));
    lines.push("");
  }
  if (schedule.length) {
    lines.push("**🟡 Agendar (importante, não urgente):**");
    schedule.forEach((t) => lines.push(`- ${capitalize(t)} → reserve um bloco de tempo`));
    lines.push("");
  }
  if (later.length) {
    lines.push("**🟢 Depois / aprender (não urgente):**");
    later.forEach((t) => lines.push(`- ${capitalize(t)}`));
    lines.push("");
  }

  lines.push("**⏱️ Sugestão de foco:** comece pelo item vermelho em um bloco de 25 min (Pomodoro), faça uma pausa de 5 min, e siga para o próximo.");
  lines.push("\nQuer que eu transforme isso em uma lista de tarefas com prazos?");

  return lines.join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
