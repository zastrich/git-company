// lib/agents/context-loader.ts
//
// Monta o contexto de um agente em camadas: começa pelo texto inline
// (`context`) e anexa o conteúdo de cada arquivo `.md` listado em
// `contextFiles`, cada um resolvido com SANDBOX na raiz do workspace.
//
// SEGURANÇA (sandbox):
//   - caminhos absolutos são rejeitados (contextFiles são relativos ao workspace);
//   - traversal (`a/../../b`) é colapsado por path.resolve e checado por prefixo;
//   - symlink-escape: path.resolve NÃO resolve symlinks, então, quando o arquivo
//     EXISTE, aplicamos fs.realpathSync no caminho resolvido E na raiz e
//     re-checamos o prefixo; quando o arquivo NÃO existe, caímos na checagem
//     lexical (não há alvo real a resolver);
//   - arquivos rejeitados/ausentes são PULADOS com warning (não derrubam o agente).
//
// CAP (M2): o limite é medido em CARACTERES (string.length/slice), para não
// quebrar code points pt-BR (multibyte). O cap cobre o RESULTADO INTEIRO
// (inline + cabeçalhos + conteúdos). Se o inline sozinho exceder o cap, o
// próprio inline é truncado. O marcador de truncamento é anexado DEPOIS do
// corte (fora do cap), mesma convenção de sanitizeOutput.

import fs from "node:fs";
import path from "node:path";
import { AgentDefinition } from "../baac/types";
import { projectRoot } from "../runtime-paths";

/** Default do cap: ~100 KB-equivalente em CARACTERES. */
export const MAX_CONTEXT_CHARS = 100 * 1024; // 102400 caracteres

export interface AssembleContextOptions {
  /** Raiz do sandbox. Default: projectRoot(). */
  workspaceRoot?: string;
  /** Limite total em CARACTERES. Default MAX_CONTEXT_CHARS. */
  maxChars?: number;
}

/** Cabeçalho que delimita o início do contexto longo (Markdown). */
export const LONG_CONTEXT_DELIMITER = "## Contexto longo (Markdown)";

/**
 * Lê um arquivo `.md` relativo ao workspace sob SANDBOX, retornando o conteúdo
 * ou null quando o caminho é rejeitado/ausente/ilegível (sempre com warning).
 * Também devolve o caminho real resolvido (para dedup por caminho absoluto).
 */
function readSandboxedFile(
  rel: string,
  root: string
): { content: string; realFull: string } | null {
  if (typeof rel !== "string" || rel.length === 0) return null;

  if (path.isAbsolute(rel)) {
    console.warn(`[context-loader] caminho rejeitado (absoluto): ${rel}`);
    return null;
  }

  const full = path.resolve(root, rel);

  // Checagem lexical de contenção (colapsa `..`).
  const containedLexically = full === root || full.startsWith(root + path.sep);
  if (!containedLexically) {
    console.warn(`[context-loader] caminho rejeitado (fora do workspace): ${rel}`);
    return null;
  }

  if (!fs.existsSync(full)) {
    console.warn(`[context-loader] arquivo de contexto ausente, pulado: ${rel}`);
    return null;
  }

  // Arquivo existe → resolve symlinks e re-checa o prefixo (N3).
  let realFull: string;
  try {
    realFull = fs.realpathSync(full);
  } catch {
    console.warn(`[context-loader] falha ao resolver caminho real, pulado: ${rel}`);
    return null;
  }
  const containedReal = realFull === root || realFull.startsWith(root + path.sep);
  if (!containedReal) {
    console.warn(`[context-loader] caminho rejeitado (symlink fora do workspace): ${rel}`);
    return null;
  }

  let content: string;
  try {
    content = fs.readFileSync(realFull, "utf-8");
  } catch {
    console.warn(`[context-loader] falha ao ler, pulado: ${rel}`);
    return null;
  }

  return { content, realFull };
}

/**
 * Monta o contexto completo do agente em camadas:
 *   1. descrição curta `context` (inline) — SEMPRE primeiro;
 *   2. contexto longo (Markdown), quando existir — delimitado por
 *      `## Contexto longo (Markdown)`:
 *        a) `contextMarkdown` (valor longo vindo do banco), como bloco inline;
 *        b) a convenção `agents/<agentId>.md` carregada automaticamente —
 *           SOMENTE quando `contextMarkdown` estiver vazio E `agentId` presente;
 *        c) cada caminho explícito em `contextFiles`.
 *
 * Dedup: a convenção `agents/<agentId>.md` nunca é carregada duas vezes se
 * também aparecer em `contextFiles` (comparação por caminho real resolvido).
 *
 * Compatibilidade: sem nenhum contexto longo (nem `contextMarkdown`, nem a
 * convenção, nem `contextFiles`), retorna o `context` inline inalterado.
 */
export function assembleAgentContext(
  agentDef: Pick<AgentDefinition, "context" | "contextFiles"> & {
    agentId?: string;
    contextMarkdown?: string;
  },
  opts?: AssembleContextOptions
): string {
  const inline = agentDef.context ?? "";
  const files = agentDef.contextFiles ?? [];
  const agentId = agentDef.agentId;
  const contextMarkdown =
    typeof agentDef.contextMarkdown === "string" && agentDef.contextMarkdown.length > 0
      ? agentDef.contextMarkdown
      : "";
  const maxChars = opts?.maxChars ?? MAX_CONTEXT_CHARS;

  const truncatedMarker = (limit: number) =>
    `\n…[contexto truncado: limite de ${limit} caracteres atingido]`;

  // Raiz do sandbox (realpath — N3).
  let root: string;
  try {
    root = fs.realpathSync(path.resolve(opts?.workspaceRoot ?? projectRoot()));
  } catch {
    root = path.resolve(opts?.workspaceRoot ?? projectRoot());
  }

  // Caminho da convenção agents/<agentId>.md (relativo). Só é candidato a
  // auto-load quando contextMarkdown está vazio (o valor do banco já carrega o
  // mesmo texto quando preenchido — evita duplicação).
  const conventionRel =
    !contextMarkdown && agentId ? `agents/${agentId}.md` : undefined;

  // ── Monta a lista ordenada de blocos de contexto longo ──
  // Cada bloco é a string já formatada que será concatenada ao resultado.
  const longBlocks: string[] = [];
  // Caminhos reais já carregados (dedup convenção × contextFiles).
  const loadedRealPaths = new Set<string>();

  // (a) contextMarkdown inline (sem cabeçalho por-arquivo).
  if (contextMarkdown) {
    longBlocks.push(contextMarkdown);
  }

  // (b) convenção agents/<agentId>.md (auto-load).
  if (conventionRel) {
    const loaded = readSandboxedFile(conventionRel, root);
    if (loaded) {
      loadedRealPaths.add(loaded.realFull);
      longBlocks.push(`## Contexto adicional: ${conventionRel}\n${loaded.content}`);
    }
  }

  // (c) contextFiles explícitos (comportamento inalterado), com dedup contra a convenção.
  for (const rel of files) {
    const loaded = readSandboxedFile(rel, root);
    if (!loaded) continue;
    if (loadedRealPaths.has(loaded.realFull)) {
      // Já carregado via convenção — não duplica.
      continue;
    }
    loadedRealPaths.add(loaded.realFull);
    longBlocks.push(`## Contexto adicional: ${rel}\n${loaded.content}`);
  }

  // ── Sem contexto longo de qualquer tipo → retorna inline inalterado ──
  if (longBlocks.length === 0) {
    if (inline.length > maxChars) {
      return inline.slice(0, maxChars) + truncatedMarker(maxChars);
    }
    return inline;
  }

  // ── Monta o resultado: curto primeiro, depois o longo delimitado ──
  // Se inline sozinho já estoura o cap, trunca o inline e para (não há espaço
  // para o longo).
  if (inline.length >= maxChars) {
    return inline.slice(0, maxChars) + truncatedMarker(maxChars);
  }

  let acc = inline;

  // Prefixo do bloco longo. Quando há descrição curta, insere o delimitador;
  // quando só há longo (inline vazio), começa direto pelo delimitador sem
  // uma linha em branco inicial redundante.
  const longHeader = inline.length > 0
    ? `\n\n${LONG_CONTEXT_DELIMITER}\n`
    : `${LONG_CONTEXT_DELIMITER}\n`;

  const appendChunk = (chunk: string): boolean => {
    const remaining = maxChars - acc.length;
    if (remaining <= 0) return false;
    if (chunk.length <= remaining) {
      acc += chunk;
      return true;
    }
    acc += chunk.slice(0, remaining) + truncatedMarker(maxChars);
    return false;
  };

  if (!appendChunk(longHeader)) return acc;

  for (let i = 0; i < longBlocks.length; i++) {
    const sep = i === 0 ? "" : "\n\n";
    if (!appendChunk(sep + longBlocks[i])) break;
  }

  return acc;
}
