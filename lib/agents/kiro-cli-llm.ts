// lib/agents/kiro-cli-llm.ts
//
// Integrador do Kiro via CLI. Single Responsibility: expor o Kiro como um
// chat model do LangChain que executa o binário `kiro chat` como subprocesso,
// autenticando com o token (KIRO_API_KEY) via variável de ambiente.
//
// Uso via provider type "kiro-cli". O token vem do secret PROVIDER_KIRO_API_KEY.
//
// NOTA IMPORTANTE (verificado nesta máquina, Kiro 1.1.70):
//   O binário `kiro chat` abre a UI do IDE e NÃO retorna a resposta no stdout,
//   portanto não é headless. Este integrador está pronto e correto para um CLI
//   que responda no stdout (modo headless), como versões futuras do Kiro CLI
//   ou um wrapper. Se o CLI não produzir saída, lançamos um erro claro em vez
//   de silenciosamente devolver vazio.

import { SimpleChatModel, type BaseChatModelParams } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { spawn } from "child_process";

export interface KiroCliChatParams extends BaseChatModelParams {
  /** Caminho do binário do Kiro CLI (default: "kiro" no PATH). */
  binPath?: string;
  /** Token do Kiro (injetado como KIRO_API_KEY no ambiente do subprocesso). */
  apiKey?: string;
  /** Modo do chat: ask | edit | agent (default: ask, mais adequado para Q&A). */
  mode?: string;
  /** Timeout em ms para a execução do CLI. */
  timeoutMs?: number;
  model?: string;
}

/** Serializa as mensagens em um prompt único para enviar ao CLI. */
function messagesToPrompt(messages: BaseMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    const role = m._getType();
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    if (role === "system") parts.push(`[SISTEMA]\n${content}`);
    else if (role === "human") parts.push(`[USUÁRIO]\n${content}`);
    else if (role === "ai") parts.push(`[ASSISTENTE]\n${content}`);
  }
  return parts.join("\n\n");
}

export class KiroCliChatModel extends SimpleChatModel {
  binPath: string;
  apiKey?: string;
  mode: string;
  timeoutMs: number;
  model: string;

  constructor(params: KiroCliChatParams = {}) {
    super(params);
    this.binPath = params.binPath ?? "kiro";
    this.apiKey = params.apiKey;
    this.mode = params.mode ?? "ask";
    this.timeoutMs = params.timeoutMs ?? 120_000;
    this.model = params.model ?? "kiro-cli";
  }

  _llmType(): string {
    return "kiro-cli";
  }

  async _call(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    const prompt = messagesToPrompt(messages);

    const { stdout, stderr, code } = await this.runCli(prompt);

    const text = stdout.trim();
    if (!text) {
      throw new Error(
        `[Kiro CLI] O comando "${this.binPath} chat" não retornou texto no stdout ` +
          `(exit ${code}). O Kiro CLI instalado abre a UI do IDE e não é headless. ` +
          `Configure um endpoint OpenAI-compatible (provider "kiro" custom) ou um ` +
          `wrapper de CLI que responda no stdout.` +
          (stderr ? `\nstderr: ${stderr.slice(0, 300)}` : "")
      );
    }
    return text;
  }

  private runCli(prompt: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const args = ["chat", "--mode", this.mode, prompt];
      const proc = spawn(this.binPath, args, {
        env: { ...process.env, ...(this.apiKey ? { KIRO_API_KEY: this.apiKey } : {}) },
        shell: process.platform === "win32",
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => { try { proc.kill(); } catch { /* noop */ } }, this.timeoutMs);

      proc.stdout?.on("data", (d) => (stdout += d.toString()));
      proc.stderr?.on("data", (d) => (stderr += d.toString()));
      proc.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? 1 }); });
      proc.on("error", (err) => { clearTimeout(timer); resolve({ stdout, stderr: String(err), code: 1 }); });
    });
  }
}
