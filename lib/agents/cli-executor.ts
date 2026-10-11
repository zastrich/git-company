// lib/agents/cli-executor.ts
//
// Executor de uma única chamada de ferramenta CLI, com auditoria.
//
// Espelha mcp-executor.ts em estrutura e contrato. Cada chamada é rastreada
// de forma isolada via createAuditLog, identificando o agente que a disparou
// (agentId/agentName) e a empresa (companyId). A sequência de eventos é:
//   CLI_CALL_STARTED   -> antes da execução
//   CLI_CALL_COMPLETED -> em caso de sucesso (com exitCode e durationMs)
//   CLI_CALL_ERROR     -> em caso de erro/timeout/exit≠0 (SEM re-lançar)
//
// SEGURANÇA (inegociável):
//   - argv é um ARRAY; a execução usa execFile (SEM shell/shell:true/sh -c).
//     Metacaracteres de shell dentro de um valor de param são apenas bytes de
//     um único argumento — o shell nunca os interpreta porque nenhum shell é
//     invocado. O comando-base e os literais JAMAIS vêm da LLM.
//   - A LLM só preenche os `param`; cada param ocupa EXATAMENTE um slot do argv.
//   - Segredos vivem só em `env` (nunca no argv auditado). Toda saída derivada
//     do processo-filho (stdout/stderr/error) passa por redactSecrets ANTES de
//     entrar em auditoria OU no ToolMessage/CliCallResult.

import { execFile } from "node:child_process";
import { DynamicStructuredTool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { createAuditLog } from "../db/audit";
import { interpolateSecrets } from "../db/secrets";
import { CliToolConfig } from "../baac/types";

// ── Constantes ──
/** Prefixo de stdout gravado no details da auditoria (em caracteres). */
export const AUDIT_PREFIX_LEN = 500;
/** Teto de stdout/stderr devolvido como ToolMessage (em caracteres). */
export const MAX_CLI_OUTPUT = 8_000;
/** Valores de segredo mais curtos que isto NÃO são redigidos (evita destruir saída legítima). */
export const MIN_SECRET_REDACT_LEN = 6;
/** maxBuffer do execFile (bytes) — protege memória; estouro vira CLI_CALL_ERROR. */
export const MAX_BUFFER = 1_000_000;
/** Timeout default (ms) e teto. */
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 120_000;

/** Parâmetros de uma chamada de ferramenta CLI auditada. */
export interface CliCallParams {
  toolCall: { id: string; name: string; args: Record<string, unknown> };
  /** Ferramentas CLI disponíveis para o agente (já em AgentDefinition). */
  cliTools: CliToolConfig[];
  /** Segredos resolvidos da empresa (getSecrets). */
  resolvedSecrets: Map<string, string>;
  companyId: string;
  agentId: string;
  agentName: string;
}

/** Resultado de uma chamada de ferramenta CLI. */
export interface CliCallResult {
  success: boolean;
  /** id da CliToolConfig (== toolCall.name). */
  toolId: string;
  /** name legível da CliToolConfig (fallback para toolCall.name). */
  toolName: string;
  /** stdout já redigido+truncado (com marcador de truncamento, se houve corte). */
  stdout?: string;
  /** stderr já redigido+truncado (com marcador de truncamento, se houve corte). */
  stderr?: string;
  exitCode?: number | null;
  /** Mensagem de erro já redigida (apenas em falha). */
  error?: string;
  durationMs: number;
}

/**
 * Redige segredos de um texto. Regras (ver design seção redação):
 *  1. corte mínimo de comprimento (MIN_SECRET_REDACT_LEN) — ignora vazios/curtos;
 *  2. match literal via split/join (sem regex);
 *  3. itera do mais longo para o mais curto (sem resíduo de prefixo/substring).
 */
export function redactSecrets(text: string, secrets: Map<string, string>): string {
  let out = text;
  const vals = [...secrets.values()]
    .filter((v) => typeof v === "string" && v.length >= MIN_SECRET_REDACT_LEN)
    .sort((a, b) => b.length - a.length);
  for (const v of vals) out = out.split(v).join("***");
  return out;
}

/**
 * Pipeline de saída (ordem fixa: redigir → truncar). Redige o fluxo completo
 * e só então corta; assim nenhum fragmento de segredo sobrevive ao corte. O
 * marcador de truncamento é anexado DEPOIS do corte (fora do cap).
 */
export function sanitizeOutput(raw: string, secrets: Map<string, string>, maxLen: number): string {
  const safe = redactSecrets(raw, secrets);
  return safe.length > maxLen
    ? safe.slice(0, maxLen) + `\n…[saída truncada: ${safe.length - maxLen} caracteres omitidos]`
    : safe;
}

/** Erro de validação de argv (param obrigatório ausente ou tipo inválido). */
class CliValidationError extends Error {}

/**
 * Monta o argv a partir do spec da ferramenta. A LLM só preenche os `param`;
 * literais vão verbatim. Coerção de tipo (ver design (a) item 4):
 *  - ausente/undefined/null + required:false  ⇒ omite o slot;
 *  - ausente/undefined/null + required:true   ⇒ CliValidationError;
 *  - string/number/boolean                    ⇒ String(v) como UM slot;
 *  - object/array                             ⇒ CliValidationError.
 */
export function buildArgv(cliTool: CliToolConfig, args: Record<string, unknown>): string[] {
  const argv: string[] = [];
  for (const spec of cliTool.args) {
    if (spec.literal !== undefined) {
      argv.push(spec.literal);
      continue;
    }
    if (!spec.param) continue; // spec sem literal nem param — ignora
    const raw = args[spec.param];
    if (raw === undefined || raw === null) {
      if (spec.required) {
        throw new CliValidationError(`parâmetro obrigatório ausente: "${spec.param}"`);
      }
      continue; // opcional ausente — omite o slot
    }
    const t = typeof raw;
    if (t === "string" || t === "number" || t === "boolean") {
      argv.push(String(raw));
    } else {
      throw new CliValidationError(`tipo inválido para "${spec.param}": ${t}`);
    }
  }
  return argv;
}

/**
 * Converte CliToolConfig[] em ferramentas LangChain (nome + descrição + schema)
 * para a LLM enxergá-las no bindTools. Espelha convertMcpToolsToLangChain:
 * passa um JSON Schema cru via `schema: (...) as never` e usa `func` placeholder
 * (a execução real acontece via executeCliToolCall). Registra, no mapa, qual
 * config é dona de cada name. SÓ os `param` entram no schema — command/literal
 * nunca são expostos à LLM.
 */
export function cliToolsToLangChain(
  cliTools: CliToolConfig[],
  toolToCli: Map<string, CliToolConfig>
): StructuredToolInterface[] {
  const result: StructuredToolInterface[] = [];
  for (const cfg of cliTools) {
    try {
      const properties: Record<string, unknown> = {};
      const requiredList: string[] = [];
      for (const a of cfg.args) {
        if (!a.param) continue;
        properties[a.param] = { type: "string", description: a.description ?? "" };
        if (a.required) requiredList.push(a.param);
      }
      const schema = { type: "object", properties, required: requiredList };
      toolToCli.set(cfg.id, cfg);
      result.push(
        new DynamicStructuredTool({
          name: cfg.id,
          description: cfg.description ?? "",
          schema: schema as never,
          func: async () => "",
        }) as unknown as StructuredToolInterface
      );
    } catch (err) {
      // Degradação graciosa: ferramenta mal-formada é pulada (log no orchestrator).
      console.warn(
        `[cli-executor] falha ao converter ferramenta CLI "${cfg?.id}":`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
  return result;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: Error & { code?: number; killed?: boolean };
}

/** Executa execFile dentro de uma Promise — SEM shell. */
function runExecFile(
  command: string,
  argv: string[],
  env: Record<string, string>,
  timeout: number
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      argv,
      { timeout, maxBuffer: MAX_BUFFER, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        const so = typeof stdout === "string" ? stdout : String(stdout ?? "");
        const se = typeof stderr === "string" ? stderr : String(stderr ?? "");
        if (error) {
          const code = (error as NodeJS.ErrnoException & { code?: number }).code;
          resolve({
            stdout: so,
            stderr: se,
            exitCode: typeof code === "number" ? code : null,
            error: error as Error,
          });
        } else {
          resolve({ stdout: so, stderr: se, exitCode: 0 });
        }
      }
    );
  });
}

/**
 * Executa uma chamada de ferramenta CLI, auditando início, fim e erro.
 * NUNCA re-lança: em caso de erro, retorna { success:false, error }.
 */
export async function executeCliToolCall(params: CliCallParams): Promise<CliCallResult> {
  const { toolCall, cliTools, resolvedSecrets, companyId, agentId, agentName } = params;

  // Derivação determinística da identidade (M1): toolId SEMPRE = toolCall.name.
  const cfg = cliTools.find((c) => c.id === toolCall.name);
  const toolId = toolCall.name;
  const toolName = cfg?.name ?? toolCall.name;

  const startedAt = Date.now();

  if (!cfg) {
    const error = `ferramenta CLI não encontrada: "${toolId}"`;
    await createAuditLog({
      companyId,
      agentId,
      agentName,
      action: "CLI_CALL_ERROR",
      details: { tool: toolId, error },
    });
    return { success: false, toolId, toolName, error, durationMs: Date.now() - startedAt };
  }

  // Monta o argv (coerção/validação). Erro de validação → não executa.
  let argv: string[];
  try {
    argv = buildArgv(cfg, toolCall.args ?? {});
  } catch (err) {
    const error = redactSecrets(err instanceof Error ? err.message : String(err), resolvedSecrets);
    await createAuditLog({
      companyId,
      agentId,
      agentName,
      action: "CLI_CALL_ERROR",
      details: { tool: toolId, command: cfg.command, error },
    });
    return { success: false, toolId, toolName, error, durationMs: Date.now() - startedAt };
  }

  const resolvedEnv = interpolateSecrets(cfg.env ?? {}, resolvedSecrets);
  const timeout = Math.min(cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

  await createAuditLog({
    companyId,
    agentId,
    agentName,
    action: "CLI_CALL_STARTED",
    // args é o argv montado (sem segredos — segredos vivem em env, nunca logado).
    details: { tool: toolId, command: cfg.command, args: argv },
  });

  const { stdout, stderr, exitCode, error } = await runExecFile(cfg.command, argv, resolvedEnv, timeout);
  const durationMs = Date.now() - startedAt;

  if (error || (exitCode !== null && exitCode !== 0)) {
    const safeError = redactSecrets(String(error?.message ?? `exit code ${exitCode}`), resolvedSecrets);
    const safeStdout = sanitizeOutput(stdout, resolvedSecrets, MAX_CLI_OUTPUT);
    const safeStderr = sanitizeOutput(stderr, resolvedSecrets, MAX_CLI_OUTPUT);
    await createAuditLog({
      companyId,
      agentId,
      agentName,
      action: "CLI_CALL_ERROR",
      details: { tool: toolId, command: cfg.command, exitCode, error: safeError, durationMs },
    });
    return {
      success: false,
      toolId,
      toolName,
      stdout: safeStdout,
      stderr: safeStderr,
      exitCode,
      error: safeError,
      durationMs,
    };
  }

  const safeStdout = sanitizeOutput(stdout, resolvedSecrets, MAX_CLI_OUTPUT);
  const safeStderr = sanitizeOutput(stderr, resolvedSecrets, MAX_CLI_OUTPUT);
  const stdoutPrefix = sanitizeOutput(stdout, resolvedSecrets, AUDIT_PREFIX_LEN);

  await createAuditLog({
    companyId,
    agentId,
    agentName,
    action: "CLI_CALL_COMPLETED",
    details: { tool: toolId, command: cfg.command, exitCode, durationMs, stdoutLen: stdout.length, stdoutPrefix },
  });

  return { success: true, toolId, toolName, stdout: safeStdout, stderr: safeStderr, exitCode, durationMs };
}
