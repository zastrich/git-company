// lib/__tests__/cli-executor-real.test.ts
//
// Execução CLI REAL ponta a ponta (SEM mock de node:child_process). Apenas a
// auditoria é mockada para não tocar o banco. Prova que executeCliToolCall roda
// um binário real (node --version) via execFile e coleta exitCode/stdout.

import { describe, it, expect, vi, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("../db/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue({}),
}));

import { executeCliToolCall } from "../agents/cli-executor";
import { CliToolConfig } from "../baac/types";

describe("cli-executor - execução real (node --version)", () => {
  it("roda node --version e retorna exitCode 0 + versão no stdout", async () => {
    const tool: CliToolConfig = {
      id: "node-version",
      name: "Node version",
      description: "versão do node",
      command: process.execPath, // caminho real do executável node
      args: [{ literal: "--version" }],
    };

    const r = await executeCliToolCall({
      companyId: "c",
      agentId: "a",
      agentName: "n",
      resolvedSecrets: new Map(),
      toolCall: { id: "c1", name: "node-version", args: {} },
      cliTools: [tool],
    });

    expect(r.success).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.stdout ?? "").toMatch(/v?\d+\.\d+\.\d+/);
  });
});

describe("cli-executor - execução real sentinela node+tsx (.mts)", () => {
  // Script temporário fora de extensions/ (nunca commitado, limpo no afterAll).
  const tmpScript = path.join(os.tmpdir(), `gc-feat002-${process.pid}-${Date.now()}.mts`);
  const MARKER = "FEAT002_TSX_OK";

  afterAll(() => {
    try {
      fs.rmSync(tmpScript, { force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("resolveSpawn(node, [tsx, <script.mts>]) executa o .mts e devolve o JSON esperado", async () => {
    // .mts trivial que imprime um JSON conhecido em stdout.
    fs.writeFileSync(
      tmpScript,
      `const out: { ok: string } = { ok: ${JSON.stringify(MARKER)} };\nprocess.stdout.write(JSON.stringify(out));\n`,
      "utf8"
    );

    const tool: CliToolConfig = {
      id: "run-tsx",
      name: "Run tsx script",
      description: "roda um .mts via sentinela node+tsx",
      command: "node", // sentinela → process.execPath
      args: [
        { literal: "tsx" }, // sentinela → tsx/dist/cli.mjs (preferindo extensions/)
        { literal: tmpScript }, // caminho absoluto já existente → passa inalterado
      ],
      timeoutMs: 60_000,
    };

    const r = await executeCliToolCall({
      companyId: "c",
      agentId: "a",
      agentName: "n",
      resolvedSecrets: new Map(),
      toolCall: { id: "c1", name: "run-tsx", args: {} },
      cliTools: [tool],
    });

    expect(r.success).toBe(true);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse((r.stdout ?? "").trim());
    expect(parsed.ok).toBe(MARKER);
  });
});
