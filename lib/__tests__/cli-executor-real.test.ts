// lib/__tests__/cli-executor-real.test.ts
//
// Execução CLI REAL ponta a ponta (SEM mock de node:child_process). Apenas a
// auditoria é mockada para não tocar o banco. Prova que executeCliToolCall roda
// um binário real (node --version) via execFile e coleta exitCode/stdout.

import { describe, it, expect, vi } from "vitest";

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
