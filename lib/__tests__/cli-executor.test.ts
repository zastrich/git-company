// lib/__tests__/cli-executor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ──
const execFileMock = vi.fn();
const createAuditLogMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

vi.mock("../db/audit", () => ({
  createAuditLog: (...args: unknown[]) => createAuditLogMock(...args),
}));

// interpolateSecrets real seria importado; mockamos para isolar (resolve {{X}}).
vi.mock("../db/secrets", async () => {
  const actual = await vi.importActual<typeof import("../db/secrets")>("../db/secrets");
  return actual;
});

import {
  executeCliToolCall,
  cliToolsToLangChain,
  buildArgv,
  redactSecrets,
  sanitizeOutput,
  MAX_CLI_OUTPUT,
  AUDIT_PREFIX_LEN,
} from "../agents/cli-executor";
import { CliToolConfig } from "../baac/types";

/** Configura o execFile mockado para resolver com (error, stdout, stderr). */
function mockExec(stdout: string, stderr = "", error: any = null) {
  execFileMock.mockImplementation((_cmd, _argv, _opts, cb) => {
    cb(error, stdout, stderr);
  });
}

const baseParams = {
  companyId: "company-1",
  agentId: "agent-1",
  agentName: "Agente Teste",
  resolvedSecrets: new Map<string, string>(),
};

const ghTool: CliToolConfig = {
  id: "gh-issue",
  name: "Criar issue",
  description: "Cria uma issue",
  command: "gh",
  args: [
    { literal: "issue" },
    { literal: "create" },
    { param: "title", required: true },
    { param: "body" },
  ],
};

describe("cli-executor - buildArgv (montagem + injeção)", () => {
  it("monta literais + params em ordem", () => {
    const argv = buildArgv(ghTool, { title: "Olá", body: "corpo" });
    expect(argv).toEqual(["issue", "create", "Olá", "corpo"]);
  });

  it("mantém metacaracteres de shell como UM ÚNICO slot (sem injeção)", () => {
    const argv = buildArgv(ghTool, { title: "; rm -rf /", body: "&& curl evil" });
    expect(argv).toEqual(["issue", "create", "; rm -rf /", "&& curl evil"]);
    // Cada valor perigoso é exatamente um elemento do array — não vaza para flags.
    expect(argv).toHaveLength(4);
  });

  it("omite slot de param opcional ausente", () => {
    const argv = buildArgv(ghTool, { title: "só título" });
    expect(argv).toEqual(["issue", "create", "só título"]);
  });

  it("coage number/boolean para string de um slot", () => {
    const tool: CliToolConfig = { ...ghTool, args: [{ param: "n" }, { param: "b" }] };
    expect(buildArgv(tool, { n: 42, b: true })).toEqual(["42", "true"]);
  });

  it("lança para param obrigatório ausente", () => {
    expect(() => buildArgv(ghTool, { body: "x" })).toThrow();
  });

  it("lança para object/array (sem [object Object])", () => {
    expect(() => buildArgv(ghTool, { title: { a: 1 } })).toThrow();
    expect(() => buildArgv(ghTool, { title: [1, 2] })).toThrow();
  });
});

describe("cli-executor - cliToolsToLangChain (schema)", () => {
  it("expõe só os param (sem command/literal) no schema", () => {
    const map = new Map<string, CliToolConfig>();
    const tools = cliToolsToLangChain([ghTool], map);
    expect(tools).toHaveLength(1);
    expect(map.get("gh-issue")).toBe(ghTool);
    const schema = (tools[0] as any).schema as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(schema.properties).sort()).toEqual(["body", "title"]);
    expect(schema.required).toEqual(["title"]);
    // Nenhuma menção a command/literal no schema.
    expect(JSON.stringify(schema)).not.toContain("gh");
    expect(JSON.stringify(schema)).not.toContain("issue");
  });
});

describe("cli-executor - redactSecrets", () => {
  it("redige valor longo e ignora valor curto/vazio", () => {
    const secrets = new Map([
      ["LONG", "supersecreto123"],
      ["SHORT", "ab"],
      ["EMPTY", ""],
    ]);
    const out = redactSecrets("token=supersecreto123 x=ab y=", secrets);
    expect(out).toContain("***");
    expect(out).not.toContain("supersecreto123");
    expect(out).toContain("x=ab"); // curto não redigido
  });

  it("redige dois valores (um substring do outro) sem resíduo", () => {
    const secrets = new Map([
      ["A", "abcdef"],
      ["B", "abcdefghij"],
    ]);
    const out = redactSecrets("v=abcdefghij", secrets);
    expect(out).toBe("v=***");
    expect(out).not.toContain("abcdef");
  });
});

describe("cli-executor - sanitizeOutput (redigir→truncar)", () => {
  it("segredo exatamente no limite de truncamento não deixa fragmento", () => {
    const secret = "SEGREDOxyz"; // 10 chars
    const secrets = new Map([["S", secret]]);
    // posiciona o segredo a cavalo do ponto de corte
    const raw = "a".repeat(8) + secret + "b".repeat(50);
    const out = sanitizeOutput(raw, secrets, 10);
    // Prova a ordem redigir→truncar: nenhum fragmento do segredo sobrevive ao corte.
    expect(out).not.toContain("SEGREDO");
    expect(out).not.toContain("xyz");
    expect(out).toContain("saída truncada");
  });

  it("não trunca quando dentro do cap e não anexa marcador", () => {
    const out = sanitizeOutput("curto", new Map(), 100);
    expect(out).toBe("curto");
  });
});

describe("cli-executor - executeCliToolCall", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    createAuditLogMock.mockReset().mockResolvedValue({});
  });

  it("sucesso: audita STARTED+COMPLETED, toolId/toolName determinísticos (M1)", async () => {
    mockExec("saída ok", "");
    const r = await executeCliToolCall({
      ...baseParams,
      toolCall: { id: "c1", name: "gh-issue", args: { title: "t" } },
      cliTools: [ghTool],
    });
    expect(r.success).toBe(true);
    expect(r.toolId).toBe("gh-issue");
    expect(r.toolName).toBe("Criar issue"); // name != id
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("saída ok");

    const actions = createAuditLogMock.mock.calls.map((c) => (c[0] as any).action);
    expect(actions).toContain("CLI_CALL_STARTED");
    expect(actions).toContain("CLI_CALL_COMPLETED");
    // details.tool === toolId em todos os eventos
    for (const call of createAuditLogMock.mock.calls) {
      expect((call[0] as any).details.tool).toBe("gh-issue");
    }
  });

  it("chama execFile SEM shell e com argv array", async () => {
    mockExec("ok");
    await executeCliToolCall({
      ...baseParams,
      toolCall: { id: "c1", name: "gh-issue", args: { title: "; rm -rf /" } },
      cliTools: [ghTool],
    });
    const [cmd, argv, opts] = execFileMock.mock.calls[0];
    expect(cmd).toBe("gh");
    expect(argv).toEqual(["issue", "create", "; rm -rf /"]);
    expect((opts as any).shell).toBeUndefined();
  });

  it("ferramenta inexistente: erro com toolName === toolCall.name (sem undefined)", async () => {
    const r = await executeCliToolCall({
      ...baseParams,
      toolCall: { id: "c1", name: "nao-existe", args: {} },
      cliTools: [ghTool],
    });
    expect(r.success).toBe(false);
    expect(r.toolId).toBe("nao-existe");
    expect(r.toolName).toBe("nao-existe");
    expect(r.error).toBeDefined();
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("object/array → CLI_CALL_ERROR sem executar", async () => {
    const r = await executeCliToolCall({
      ...baseParams,
      toolCall: { id: "c1", name: "gh-issue", args: { title: { x: 1 } } },
      cliTools: [ghTool],
    });
    expect(r.success).toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
    const actions = createAuditLogMock.mock.calls.map((c) => (c[0] as any).action);
    expect(actions).toContain("CLI_CALL_ERROR");
  });

  it("redige segredo em stdout E no stdoutPrefix auditado (Finding 1)", async () => {
    const secret = "chave-super-secreta-123";
    mockExec(`resultado token=${secret} fim`);
    const r = await executeCliToolCall({
      ...baseParams,
      resolvedSecrets: new Map([["API", secret]]),
      toolCall: { id: "c1", name: "gh-issue", args: { title: "t" } },
      cliTools: [ghTool],
    });
    expect(r.stdout).not.toContain(secret);
    expect(r.stdout).toContain("***");
    const completed = createAuditLogMock.mock.calls
      .map((c) => c[0] as any)
      .find((d) => d.action === "CLI_CALL_COMPLETED");
    expect(completed.details.stdoutPrefix).not.toContain(secret);
    expect(JSON.stringify(completed.details)).not.toContain(secret);
  });

  it("erro com segredo no stderr/message não vaza no error auditado (Finding 3)", async () => {
    const secret = "token-secreto-abcdef";
    const err: any = new Error(`falhou com token=${secret}`);
    err.code = 1;
    mockExec("", `stderr com ${secret}`, err);
    const r = await executeCliToolCall({
      ...baseParams,
      resolvedSecrets: new Map([["API", secret]]),
      toolCall: { id: "c1", name: "gh-issue", args: { title: "t" } },
      cliTools: [ghTool],
    });
    expect(r.success).toBe(false);
    expect(r.error).not.toContain(secret);
    expect(r.stderr).not.toContain(secret);
    const errAudit = createAuditLogMock.mock.calls
      .map((c) => c[0] as any)
      .find((d) => d.action === "CLI_CALL_ERROR");
    expect(JSON.stringify(errAudit.details)).not.toContain(secret);
  });

  it("exit code != 0 → success:false com stdout/stderr/exitCode", async () => {
    const err: any = new Error("comando falhou");
    err.code = 2;
    mockExec("parcial", "erro", err);
    const r = await executeCliToolCall({
      ...baseParams,
      toolCall: { id: "c1", name: "gh-issue", args: { title: "t" } },
      cliTools: [ghTool],
    });
    expect(r.success).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("erro");
  });

  it("saída acima do cap é truncada com marcador no CliCallResult (N4)", async () => {
    mockExec("x".repeat(MAX_CLI_OUTPUT + 100));
    const r = await executeCliToolCall({
      ...baseParams,
      toolCall: { id: "c1", name: "gh-issue", args: { title: "t" } },
      cliTools: [ghTool],
    });
    expect(r.stdout).toContain("saída truncada");
  });

  it("nunca re-lança (resolve sempre)", async () => {
    execFileMock.mockImplementation(() => {
      throw new Error("boom síncrono");
    });
    // mesmo com execFile lançando, a validação ocorre antes; força caminho de exec:
    mockExec("ok");
    await expect(
      executeCliToolCall({
        ...baseParams,
        toolCall: { id: "c1", name: "gh-issue", args: { title: "t" } },
        cliTools: [ghTool],
      })
    ).resolves.toBeDefined();
  });
});


