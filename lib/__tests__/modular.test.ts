// lib/__tests__/modular.test.ts
//
// Round-trip do serializador MODULAR real (pushModular/pullModular).
// Diferente de org-sync.test.ts, que mocka pushModular/pullModular, aqui
// exercitamos o serializador de verdade mockando apenas o @octokit/rest:
// createOrUpdateFileContents captura {path, content} em um mapa em memória
// e getContent devolve o conteúdo capturado (base64, type: "file").
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessConfig, McpServerConfig, CliToolConfig } from "../baac/types";

// ── Mock do Octokit: repositório em memória ──
const repoFiles = new Map<string, string>(); // path → conteúdo utf-8

const getContentMock = vi.fn(async ({ path }: { path: string }) => {
  if (!repoFiles.has(path)) {
    // Simula "não existe" (igual ao GitHub 404) para o putFile não achar sha.
    throw new Error(`Not Found: ${path}`);
  }
  const text = repoFiles.get(path)!;
  return {
    data: {
      type: "file",
      content: Buffer.from(text, "utf-8").toString("base64"),
      sha: `sha-${path}`,
    },
  };
});

const createOrUpdateFileContentsMock = vi.fn(
  async ({ path, content }: { path: string; content: string }) => {
    repoFiles.set(path, Buffer.from(content, "base64").toString("utf-8"));
    return { data: {} };
  }
);

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    rest = {
      repos: {
        getContent: (...a: unknown[]) => getContentMock(...(a as [any])),
        createOrUpdateFileContents: (...a: unknown[]) =>
          createOrUpdateFileContentsMock(...(a as [any])),
      },
    };
  },
}));

import { pushModular, pullModular } from "../sync/modular";

// ── Fixtures ──
const mcp: McpServerConfig[] = [
  { id: "notion", name: "Notion MCP", transport: "sse", url: "https://mcp.notion/sse" },
];
const cli: CliToolConfig[] = [
  {
    id: "calendar_list_events",
    name: "Listar eventos",
    description: "Lista eventos do Google Agenda",
    command: "node",
    args: [{ literal: "calendar.js" }, { param: "range", required: true, description: "intervalo" }],
    env: { GOOGLE_OAUTH_CREDENTIALS: "{{GOOGLE_OAUTH_CREDENTIALS}}", GOOGLE_IMPERSONATE_SUBJECT: "{{GOOGLE_IMPERSONATE_SUBJECT}}" },
  },
  {
    id: "calendar_create_event",
    name: "Criar evento",
    description: "Cria evento no Google Agenda",
    command: "node",
    args: [{ literal: "calendar.js" }],
  },
];

function makeBusiness(): BusinessConfig {
  return {
    companyName: "Zas Organizer",
    mission: "organizar",
    version: "1.0",
    agents: [
      {
        // agente com cliTools + contextFiles (estilo agente-agenda)
        agentId: "agente-agenda",
        role: "Agenda",
        type: "ai",
        llm: { provider: "openai", model: "gpt-4o" },
        context: "ctx-agenda",
        tickIntervalSeconds: 300,
        labels: ["agenda"],
        subordinates: [],
        cliTools: cli,
        contextFiles: ["docs/agenda.md"],
        isCeo: true,
      },
      {
        // agente com mcpServers (estilo agente-notion)
        agentId: "agente-notion",
        role: "Notion",
        type: "ai",
        llm: { provider: "openai", model: "gpt-4o" },
        context: "ctx-notion",
        tickIntervalSeconds: 300,
        labels: ["notion"],
        subordinates: [],
        mcpServers: mcp,
      },
      {
        // agente sem ferramentas → os três campos devem ser omitidos
        agentId: "agente-simples",
        role: "Simples",
        type: "ai",
        llm: { provider: "openai", model: "gpt-4o" },
        context: "ctx-simples",
        tickIntervalSeconds: 300,
        labels: ["dev"],
        subordinates: [],
      },
    ],
    infrastructure: {
      labels: [],
      milestones: [],
      project: {
        title: "Zas — Board",
        views: [],
        columns: [
          { name: "Backlog", description: "b" },
          { name: "Concluído", description: "c", isDone: true },
        ],
      },
      workflows: [],
      issueLifecycle: {
        completionPatterns: ["[TAREFA_CONCLUÍDA]"],
        completionColumn: "Concluído",
        autoClose: true,
        defaultColumn: "Backlog",
        manualActionColumn: "Ação Manual",
      },
    },
    orgChart: {
      ceo: {
        agentId: "agente-agenda",
        role: "Agenda",
        type: "ai",
        context: "ctx-agenda",
        subordinates: [],
      },
      departments: {},
    },
  };
}

describe("Modular - round-trip de cliTools/mcpServers/contextFiles", () => {
  beforeEach(() => {
    repoFiles.clear();
    getContentMock.mockClear();
    createOrUpdateFileContentsMock.mockClear();
  });

  it("pushModular emite cliTools/mcpServers/contextFiles com as formas exatas e omite quando vazio", async () => {
    await pushModular("tok", "owner", "repo", makeBusiness());

    const agenda = JSON.parse(repoFiles.get("agents/agente-agenda.json")!);
    expect(agenda.cliTools).toEqual(cli);
    expect(agenda.contextFiles).toEqual(["docs/agenda.md"]);
    // Sem mcpServers → omitido do JSON.
    expect("mcpServers" in agenda).toBe(false);
    expect(agenda.isCeo).toBe(true);

    const notion = JSON.parse(repoFiles.get("agents/agente-notion.json")!);
    expect(notion.mcpServers).toEqual(mcp);
    expect("cliTools" in notion).toBe(false);
    expect("contextFiles" in notion).toBe(false);

    const simples = JSON.parse(repoFiles.get("agents/agente-simples.json")!);
    expect("cliTools" in simples).toBe(false);
    expect("mcpServers" in simples).toBe(false);
    expect("contextFiles" in simples).toBe(false);

    // Secrets passam como placeholders verbatim (nenhum valor real).
    const raw = repoFiles.get("agents/agente-agenda.json")!;
    expect(raw).toContain("{{GOOGLE_OAUTH_CREDENTIALS}}");
    expect(raw).toContain("{{GOOGLE_IMPERSONATE_SUBJECT}}");

    // business.json continua sendo índice modular.
    const index = JSON.parse(repoFiles.get("business.json")!);
    expect(index.modular).toBe(true);
    expect(index.agentRefs).toEqual(
      expect.arrayContaining([{ agentId: "agente-agenda", path: "agents/agente-agenda.json" }])
    );
  });

  it("pullModular reconstrói cliTools/mcpServers/contextFiles idênticos e preserva isCeo", async () => {
    await pushModular("tok", "owner", "repo", makeBusiness());

    const business = await pullModular("tok", "owner", "repo");
    expect(business).not.toBeNull();

    const agenda = business!.agents.find((a) => a.agentId === "agente-agenda")!;
    expect(agenda.cliTools).toEqual(cli);
    expect(agenda.contextFiles).toEqual(["docs/agenda.md"]);
    expect(agenda.isCeo).toBe(true);

    const notion = business!.agents.find((a) => a.agentId === "agente-notion")!;
    expect(notion.mcpServers).toEqual(mcp);

    const simples = business!.agents.find((a) => a.agentId === "agente-simples")!;
    expect(simples.cliTools).toBeUndefined();
    expect(simples.mcpServers).toBeUndefined();
    expect(simples.contextFiles).toBeUndefined();
  });
});
