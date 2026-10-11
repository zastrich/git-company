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
