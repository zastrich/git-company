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

/**
 * Monta o contexto completo do agente (inline + arquivos .md).
 * Retorna o `context` inline inalterado quando `contextFiles` é vazio/ausente.
 */
export function assembleAgentContext(
  agentDef: Pick<AgentDefinition, "context" | "contextFiles">,
  opts?: AssembleContextOptions
): string {
  const inline = agentDef.context ?? "";
  const files = agentDef.contextFiles;
  const maxChars = opts?.maxChars ?? MAX_CONTEXT_CHARS;

  if (!files || files.length === 0) {
    return inline;
  }

  const truncatedMarker = (limit: number) =>
    `\n…[contexto truncado: limite de ${limit} caracteres atingido]`;

  // Se o inline sozinho já estoura o cap, trunca o próprio inline e para.
  if (inline.length >= maxChars) {
    return inline.slice(0, maxChars) + truncatedMarker(maxChars);
  }

  // Raiz do sandbox (realpath — N3).
  let root: string;
  try {
    root = fs.realpathSync(path.resolve(opts?.workspaceRoot ?? projectRoot()));
  } catch {
    root = path.resolve(opts?.workspaceRoot ?? projectRoot());
  }

  let acc = inline;

  for (const rel of files) {
    if (acc.length >= maxChars) break;

    if (typeof rel !== "string" || rel.length === 0) continue;

    if (path.isAbsolute(rel)) {
      console.warn(`[context-loader] caminho rejeitado (absoluto): ${rel}`);
      continue;
    }

    const full = path.resolve(root, rel);

    // Checagem lexical de contenção (colapsa `..`).
    const containedLexically = full === root || full.startsWith(root + path.sep);
    if (!containedLexically) {
      console.warn(`[context-loader] caminho rejeitado (fora do workspace): ${rel}`);
      continue;
    }

    if (!fs.existsSync(full)) {
      console.warn(`[context-loader] arquivo de contexto ausente, pulado: ${rel}`);
      continue;
    }

    // Arquivo existe → resolve symlinks e re-checa o prefixo (N3).
    let realFull: string;
    try {
      realFull = fs.realpathSync(full);
    } catch {
      console.warn(`[context-loader] falha ao resolver caminho real, pulado: ${rel}`);
      continue;
    }
    const containedReal = realFull === root || realFull.startsWith(root + path.sep);
    if (!containedReal) {
      console.warn(`[context-loader] caminho rejeitado (symlink fora do workspace): ${rel}`);
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(realFull, "utf-8");
    } catch {
      console.warn(`[context-loader] falha ao ler, pulado: ${rel}`);
      continue;
    }

    const block = `\n\n## Contexto adicional: ${rel}\n${content}`;
    const remaining = maxChars - acc.length;
    if (block.length <= remaining) {
      acc += block;
    } else {
      // Inclui o quanto couber e para de processar os demais.
      acc += block.slice(0, remaining) + truncatedMarker(maxChars);
      break;
    }
  }

  return acc;
}
