// lib/__tests__/org-sync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Harness de mocks (hoisted) para round-trip de org-sync ──
const companyFindUniqueMock = vi.fn();
const companyUpdateMock = vi.fn();
const agentFindManyMock = vi.fn();
const agentUpsertMock = vi.fn();
const companyRepoFindManyMock = vi.fn();
const companyConfigFindUniqueMock = vi.fn();
const aiProviderFindFirstMock = vi.fn();
const pullModularMock = vi.fn();
const pushModularMock = vi.fn();
const clearDirtyMock = vi.fn();

vi.mock("../db/client", () => ({
  prisma: {
    company: {
      findUnique: (...a: unknown[]) => companyFindUniqueMock(...a),
      update: (...a: unknown[]) => companyUpdateMock(...a),
    },
    agentConfig: {
      findMany: (...a: unknown[]) => agentFindManyMock(...a),
      upsert: (...a: unknown[]) => agentUpsertMock(...a),
    },
    companyRepo: { findMany: (...a: unknown[]) => companyRepoFindManyMock(...a) },
    companyConfig: { findUnique: (...a: unknown[]) => companyConfigFindUniqueMock(...a) },
    aIProvider: { findFirst: (...a: unknown[]) => aiProviderFindFirstMock(...a) },
  },
}));

vi.mock("../sync/modular", () => ({
  pullModular: (...a: unknown[]) => pullModularMock(...a),
  pushModular: (...a: unknown[]) => pushModularMock(...a),
}));

vi.mock("../sync/dirty", () => ({
  clearDirty: (...a: unknown[]) => clearDirtyMock(...a),
}));

vi.mock("../db/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue({}),
}));

import { buildLocalBusinessJson, pullFromRemote, pushToRemote } from "../sync/org-sync";

// ── Testes de validação simples preservados ──
describe("Org Sync - Sync Direction Validation", () => {
  it("should recognize push as valid direction", () => {
    expect(["push", "pull"]).toContain("push");
  });
  it("should recognize pull as valid direction", () => {
    expect(["push", "pull"]).toContain("pull");
  });
  it("should reject invalid direction", () => {
    const validDirections = ["push", "pull"];
    expect(validDirections).not.toContain("sync");
    expect(validDirections).not.toContain("both");
  });
});

// ── Round-trip: build + pull preservando isCeo + ferramentas ──
describe("Org Sync - round-trip de mcpServers/cliTools/contextFiles/isCeo", () => {
  beforeEach(() => {
    companyFindUniqueMock.mockReset().mockResolvedValue({
      id: "company-1",
      name: "Zas Organizer",
      mission: "organizar",
      githubToken: "tok",
      githubOwner: "owner",
      repoName: "repo",
    });
    companyUpdateMock.mockReset().mockResolvedValue({});
    agentFindManyMock.mockReset();
    agentUpsertMock.mockReset().mockResolvedValue({});
    companyRepoFindManyMock.mockReset().mockResolvedValue([]);
    companyConfigFindUniqueMock.mockReset().mockResolvedValue(null);
    aiProviderFindFirstMock.mockReset().mockResolvedValue({ id: "prov-1", type: "openai", baseUrl: null });
    pullModularMock.mockReset();
    pushModularMock.mockReset().mockResolvedValue(undefined);
    clearDirtyMock.mockReset().mockResolvedValue(undefined);
  });

  it("buildLocalBusinessJson emite isCeo + ferramentas (CEO com agentId != 'ceo')", async () => {
    const mcp = [{ id: "gcal", name: "G", transport: "sse", url: "u" }];
    const cli = [{ id: "gh", name: "GH", description: "d", command: "gh", args: [{ literal: "x" }] }];
    agentFindManyMock.mockResolvedValue([
      {
        agentId: "diretor-geral",
        role: "Diretor",
        type: "ai",
        provider: { type: "openai", baseUrl: null },
        model: "gpt-4o",
        temperature: 0.2,
        maxTokens: 4096,
        context: "ctx",
        tickIntervalSeconds: 300,
        labels: "ceo",
        subordinates: "sub",
        githubUsername: "",
        isCeo: true,
        mcpServers: JSON.stringify(mcp),
        cliTools: JSON.stringify(cli),
        contextFiles: JSON.stringify(["docs/x.md"]),
        contextMarkdown: "# Longo do diretor",
      },
      {
        agentId: "sub",
        role: "Subordinado",
        type: "ai",
        provider: { type: "openai", baseUrl: null },
        model: "gpt-4o",
        temperature: 0.2,
        maxTokens: 4096,
        context: "ctx2",
        tickIntervalSeconds: 300,
        labels: "dev",
        subordinates: "",
        githubUsername: "",
        isCeo: false,
        mcpServers: "",
        cliTools: "[]",
        contextFiles: "",
        contextMarkdown: "",
      },
    ]);

    const result = await buildLocalBusinessJson("company-1");
    const ceo = result.agents.find((a) => a.agentId === "diretor-geral")!;
    const sub = result.agents.find((a) => a.agentId === "sub")!;

    expect(ceo.isCeo).toBe(true);
    expect(ceo.mcpServers).toEqual(mcp);
    expect(ceo.cliTools).toEqual(cli);
    expect(ceo.contextFiles).toEqual(["docs/x.md"]);
    expect(ceo.contextMarkdown).toBe("# Longo do diretor");
    // orgChart.ceo derivado da mesma coluna isCeo.
    expect(result.orgChart?.ceo.agentId).toBe("diretor-geral");

    // Subordinado sem isCeo e com campos vazios → undefined (omitido).
    expect(sub.isCeo).toBeUndefined();
    expect(sub.mcpServers).toBeUndefined();
    expect(sub.cliTools).toBeUndefined();
    expect(sub.contextFiles).toBeUndefined();
    expect(sub.contextMarkdown).toBeUndefined();
  });

  it("pullFromRemote preserva isCeo e grava ferramentas como strings JSON", async () => {
    const mcp = [{ id: "gcal", name: "G", transport: "sse", url: "u" }];
    const cli = [{ id: "gh", name: "GH", description: "d", command: "gh", args: [] }];
    pullModularMock.mockResolvedValue({
      companyName: "Zas Organizer",
      mission: "m",
      version: "1.0",
      agents: [
        {
          agentId: "diretor-geral",
          role: "Diretor",
          type: "ai",
          llm: { provider: "openai", model: "gpt-4o" },
          context: "ctx",
          tickIntervalSeconds: 300,
          labels: ["ceo"],
          isCeo: true,
          mcpServers: mcp,
          cliTools: cli,
          contextFiles: ["docs/x.md"],
          contextMarkdown: "# Longo do diretor",
        },
      ],
      infrastructure: { labels: [], milestones: [], project: { title: "", views: [], columns: [] }, workflows: [] },
    });

    await pullFromRemote("company-1");

    expect(agentUpsertMock).toHaveBeenCalledTimes(1);
    const arg = agentUpsertMock.mock.calls[0][0] as any;
    expect(arg.update.isCeo).toBe(true); // preservado, apesar de agentId != "ceo"
    expect(typeof arg.update.mcpServers).toBe("string");
    expect(JSON.parse(arg.update.mcpServers)).toEqual(mcp);
    expect(JSON.parse(arg.update.cliTools)).toEqual(cli);
    expect(JSON.parse(arg.update.contextFiles)).toEqual(["docs/x.md"]);
    expect(arg.update.contextMarkdown).toBe("# Longo do diretor");
  });

  it("pullFromRemote: JSON antigo sem isCeo cai no fallback agentId === 'ceo'", async () => {
    pullModularMock.mockResolvedValue({
      companyName: "X",
      version: "1.0",
      agents: [
        {
          agentId: "ceo",
          role: "CEO",
          type: "ai",
          llm: { provider: "openai", model: "gpt-4o" },
          context: "c",
          tickIntervalSeconds: 300,
          labels: [],
        },
        {
          agentId: "outro",
          role: "Outro",
          type: "ai",
          llm: { provider: "openai", model: "gpt-4o" },
          context: "c",
          tickIntervalSeconds: 300,
          labels: [],
        },
      ],
      infrastructure: { labels: [], milestones: [], project: { title: "", views: [], columns: [] }, workflows: [] },
    });

    await pullFromRemote("company-1");

    const calls = agentUpsertMock.mock.calls.map((c) => c[0] as any);
    const ceoCall = calls.find((c) => c.where.companyId_agentId.agentId === "ceo")!;
    const outroCall = calls.find((c) => c.where.companyId_agentId.agentId === "outro")!;
    expect(ceoCall.update.isCeo).toBe(true);
    expect(outroCall.update.isCeo).toBe(false);
  });

  it("pushToRemote entrega ao pushModular um BusinessConfig com as ferramentas intactas", async () => {
    const mcp = [{ id: "notion", name: "Notion", transport: "sse", url: "https://mcp/sse" }];
    const cli = [
      { id: "calendar_list_events", name: "Listar", description: "d", command: "node", args: [{ literal: "cal.js" }] },
      { id: "calendar_create_event", name: "Criar", description: "d", command: "node", args: [] },
    ];
    agentFindManyMock.mockResolvedValue([
      {
        agentId: "agente-agenda",
        role: "Agenda",
        type: "ai",
        provider: { type: "openai", baseUrl: null },
        model: "gpt-4o",
        temperature: 0.2,
        maxTokens: 4096,
        context: "ctx",
        tickIntervalSeconds: 300,
        labels: "agenda",
        subordinates: "",
        githubUsername: "",
        isCeo: false,
        mcpServers: "",
        cliTools: JSON.stringify(cli),
        contextFiles: "",
      },
      {
        agentId: "agente-notion",
        role: "Notion",
        type: "ai",
        provider: { type: "openai", baseUrl: null },
        model: "gpt-4o",
        temperature: 0.2,
        maxTokens: 4096,
        context: "ctx",
        tickIntervalSeconds: 300,
        labels: "notion",
        subordinates: "",
        githubUsername: "",
        isCeo: false,
        mcpServers: JSON.stringify(mcp),
        cliTools: "",
        contextFiles: "",
      },
    ]);

    const result = await pushToRemote("company-1");
    expect(result.success).toBe(true);

    expect(pushModularMock).toHaveBeenCalledTimes(1);
    const [, , , business] = pushModularMock.mock.calls[0] as any[];
    const agenda = business.agents.find((a: any) => a.agentId === "agente-agenda");
    const notion = business.agents.find((a: any) => a.agentId === "agente-notion");
    expect(agenda.cliTools).toEqual(cli);
    expect(notion.mcpServers).toEqual(mcp);
  });
});
