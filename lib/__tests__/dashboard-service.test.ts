// lib/__tests__/dashboard-service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Harness de mocks (hoisted) ──
const companyUpdateMock = vi.fn();
const companyFindUniqueMock = vi.fn();
const gqlMock = vi.fn();

vi.mock("../db/client", () => ({
  prisma: {
    company: {
      findUnique: (...a: unknown[]) => companyFindUniqueMock(...a),
      update: (...a: unknown[]) => companyUpdateMock(...a),
    },
    companyConfig: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

// gqlClient em dashboard-service faz `await import("@octokit/graphql")`.
vi.mock("@octokit/graphql", () => ({
  graphql: { defaults: () => (...a: unknown[]) => gqlMock(...a) },
}));

vi.mock("../db/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue({}),
}));

import {
  adoptProjectV2,
  stageStatusOptions,
  stageForIssue,
  type RepoRef,
} from "../github/dashboard-service";

const ref: RepoRef = { owner: "zastrich", repo: "zas-organizer-org", token: "tok", companyId: "company-1" };
const STAGES = ["Backlog", "Em Progresso", "Revisão", "Ação Manual", "Concluído"];

beforeEach(() => {
  companyUpdateMock.mockReset().mockResolvedValue({});
  companyFindUniqueMock.mockReset();
  gqlMock.mockReset();
});

describe("adoptProjectV2", () => {
  it("resolve o node id de um projeto de usuário a partir de um número e persiste em company.projectId", async () => {
    gqlMock.mockResolvedValueOnce({ user: { projectV2: { id: "PVT_node_7", title: "Zas Organizer" } } });

    const id = await adoptProjectV2(ref, 7);

    expect(id).toBe("PVT_node_7");
    // query de usuário com number=7
    const [query, vars] = gqlMock.mock.calls[0];
    expect(String(query)).toContain("user(login:$owner)");
    expect(vars).toMatchObject({ owner: "zastrich", n: 7 });
    // persistência
    expect(companyUpdateMock).toHaveBeenCalledWith({
      where: { id: "company-1" },
      data: { projectId: "PVT_node_7" },
    });
  });

  it("extrai o número de uma URL e resolve o node id", async () => {
    gqlMock.mockResolvedValueOnce({ user: { projectV2: { id: "PVT_node_7" } } });

    const id = await adoptProjectV2(ref, "https://github.com/users/zastrich/projects/7");

    expect(id).toBe("PVT_node_7");
    const [, vars] = gqlMock.mock.calls[0];
    expect(vars).toMatchObject({ n: 7 });
  });

  it("faz fallback para projeto de organização quando user() não retorna", async () => {
    gqlMock
      .mockResolvedValueOnce({ user: { projectV2: null } })
      .mockResolvedValueOnce({ organization: { projectV2: { id: "PVT_org_3" } } });

    const id = await adoptProjectV2(ref, 3);

    expect(id).toBe("PVT_org_3");
    expect(String(gqlMock.mock.calls[1][0])).toContain("organization(login:$owner)");
  });

  it("lança erro pt-BR 'não encontrado' quando o projeto não existe", async () => {
    gqlMock
      .mockResolvedValueOnce({ user: { projectV2: null } })
      .mockResolvedValueOnce({ organization: null });

    await expect(adoptProjectV2(ref, 99)).rejects.toThrow(
      "Project v2 #99 não encontrado para o owner zastrich."
    );
    expect(companyUpdateMock).not.toHaveBeenCalled();
  });
});

describe("stageStatusOptions", () => {
  it("retorna os 5 nomes na ordem com as cores corretas", () => {
    const opts = stageStatusOptions(STAGES);
    expect(opts.map((o) => o.name)).toEqual(STAGES);
    expect(opts.map((o) => o.color)).toEqual(["GRAY", "GRAY", "YELLOW", "YELLOW", "GREEN"]);
  });
});

describe("stageForIssue", () => {
  it("mapeia o label stage::X para X", () => {
    expect(stageForIssue(["agent::x", "stage::Revisão"], "open", STAGES)).toBe("Revisão");
  });

  it("fallback: issue fechada sem label stage:: cai na ÚLTIMA etapa", () => {
    expect(stageForIssue([], "closed", STAGES)).toBe("Concluído");
  });

  it("fallback: issue aberta sem label stage:: cai na PRIMEIRA etapa", () => {
    expect(stageForIssue([], "open", STAGES)).toBe("Backlog");
  });
});
