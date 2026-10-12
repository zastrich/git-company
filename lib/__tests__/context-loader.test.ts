// lib/__tests__/context-loader.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assembleAgentContext } from "../agents/context-loader";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-loader-"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("context-loader - montagem em camadas", () => {
  it("monta inline + conteúdo de dois .md com cabeçalhos de bloco", () => {
    fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "docs", "a.md"), "conteúdo A");
    fs.writeFileSync(path.join(tmp, "docs", "b.md"), "conteúdo B");

    const out = assembleAgentContext(
      { context: "inline base", contextFiles: ["docs/a.md", "docs/b.md"] },
      { workspaceRoot: tmp }
    );

    expect(out).toContain("inline base");
    expect(out).toContain("## Contexto adicional: docs/a.md");
    expect(out).toContain("conteúdo A");
    expect(out).toContain("## Contexto adicional: docs/b.md");
    expect(out).toContain("conteúdo B");
  });

  it("pula arquivo ausente com warning sem quebrar a montagem", () => {
    fs.writeFileSync(path.join(tmp, "existe.md"), "presente");
    const out = assembleAgentContext(
      { context: "base", contextFiles: ["existe.md", "sumiu.md"] },
      { workspaceRoot: tmp }
    );
    expect(out).toContain("presente");
    expect(out).not.toContain("sumiu.md");
  });

  it("retorna context inalterado sem contextFiles", () => {
    expect(assembleAgentContext({ context: "só inline" }, { workspaceRoot: tmp })).toBe("só inline");
    expect(assembleAgentContext({ context: "x", contextFiles: [] }, { workspaceRoot: tmp })).toBe("x");
  });
});

describe("context-loader - sandbox", () => {
  it("rejeita caminho absoluto", () => {
    const abs = path.join(tmp, "fora.md");
    fs.writeFileSync(abs, "conteúdo fora");
    const out = assembleAgentContext(
      { context: "base", contextFiles: [abs] },
      { workspaceRoot: tmp }
    );
    expect(out).toBe("base");
    expect(out).not.toContain("conteúdo fora");
  });

  it("rejeita traversal ../ e a/../../b", () => {
    // cria um arquivo fora do root
    const parent = path.dirname(tmp);
    const outsidePath = path.join(parent, "segredo.md");
    fs.writeFileSync(outsidePath, "SEGREDO EXTERNO");
    try {
      const out = assembleAgentContext(
        { context: "base", contextFiles: ["../segredo.md", "a/../../segredo.md"] },
        { workspaceRoot: tmp }
      );
      expect(out).toBe("base");
      expect(out).not.toContain("SEGREDO EXTERNO");
    } finally {
      fs.rmSync(outsidePath, { force: true });
    }
  });
});

describe("context-loader - convenção agents/<id>.md + curto/longo", () => {
  it("auto-carrega agents/<agentId>.md mesmo sem contextFiles", () => {
    fs.mkdirSync(path.join(tmp, "agents"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "agents", "x.md"), "contexto longo do X");

    const out = assembleAgentContext(
      { agentId: "x", context: "curto" },
      { workspaceRoot: tmp }
    );

    expect(out).toContain("curto");
    expect(out).toContain("## Contexto longo (Markdown)");
    expect(out).toContain("## Contexto adicional: agents/x.md");
    expect(out).toContain("contexto longo do X");
  });

  it("short + long ambos presentes: curto vem ANTES do delimitador longo", () => {
    fs.mkdirSync(path.join(tmp, "agents"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "agents", "x.md"), "LONGO");

    const out = assembleAgentContext(
      { agentId: "x", context: "CURTO" },
      { workspaceRoot: tmp }
    );

    const idxShort = out.indexOf("CURTO");
    const idxDelim = out.indexOf("## Contexto longo (Markdown)");
    const idxLong = out.indexOf("LONGO");
    expect(idxShort).toBeGreaterThanOrEqual(0);
    expect(idxDelim).toBeGreaterThan(idxShort);
    expect(idxLong).toBeGreaterThan(idxDelim);
  });

  it("não duplica quando agents/<id>.md também está em contextFiles", () => {
    fs.mkdirSync(path.join(tmp, "agents"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "agents", "x.md"), "CONTEUDO_UNICO");

    const out = assembleAgentContext(
      { agentId: "x", context: "curto", contextFiles: ["agents/x.md"] },
      { workspaceRoot: tmp }
    );

    const occurrences = out.split("CONTEUDO_UNICO").length - 1;
    expect(occurrences).toBe(1);
  });

  it("contextMarkdown (valor do banco) suprime o auto-load da convenção", () => {
    fs.mkdirSync(path.join(tmp, "agents"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "agents", "x.md"), "DO_DISCO");

    const out = assembleAgentContext(
      { agentId: "x", context: "curto", contextMarkdown: "DO_BANCO" },
      { workspaceRoot: tmp }
    );

    expect(out).toContain("DO_BANCO");
    expect(out).not.toContain("DO_DISCO");
    expect(out).not.toContain("## Contexto adicional: agents/x.md");
  });

  it("só-longo (context vazio + contextMarkdown) não prefixa descrição curta", () => {
    const out = assembleAgentContext(
      { agentId: "x", context: "", contextMarkdown: "APENAS_LONGO" },
      { workspaceRoot: tmp }
    );

    expect(out.startsWith("## Contexto longo (Markdown)")).toBe(true);
    expect(out).toContain("APENAS_LONGO");
  });

  it("short-only (sem nenhum contexto longo) retorna context inalterado", () => {
    expect(
      assembleAgentContext({ agentId: "x", context: "só curto" }, { workspaceRoot: tmp })
    ).toBe("só curto");
  });

  it("agentId com traversal (../evil) não lê arquivo fora do sandbox", () => {
    const parent = path.dirname(tmp);
    const outside = path.join(parent, "evil.md");
    fs.writeFileSync(outside, "SEGREDO_FORA");
    try {
      const out = assembleAgentContext(
        { agentId: "../evil", context: "curto" },
        { workspaceRoot: tmp }
      );
      expect(out).toBe("curto");
      expect(out).not.toContain("SEGREDO_FORA");
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});

describe("context-loader - cap/truncamento (M2)", () => {
  it("trunca com marcador exato quando o total excede maxChars", () => {
    fs.writeFileSync(path.join(tmp, "grande.md"), "y".repeat(500));
    const out = assembleAgentContext(
      { context: "base", contextFiles: ["grande.md"] },
      { workspaceRoot: tmp, maxChars: 50 }
    );
    expect(out).toContain("limite de 50 caracteres atingido");
    // Marcador fora do cap: o corpo até o marcador tem no máximo 50 chars.
    const marker = "\n…[contexto truncado: limite de 50 caracteres atingido]";
    expect(out.endsWith(marker)).toBe(true);
    expect(out.slice(0, out.length - marker.length).length).toBeLessThanOrEqual(50);
  });

  it("trunca o próprio inline quando sozinho excede o cap", () => {
    const out = assembleAgentContext(
      { context: "z".repeat(200), contextFiles: ["qualquer.md"] },
      { workspaceRoot: tmp, maxChars: 30 }
    );
    expect(out.startsWith("z".repeat(30))).toBe(true);
    expect(out).toContain("limite de 30 caracteres atingido");
  });
});
