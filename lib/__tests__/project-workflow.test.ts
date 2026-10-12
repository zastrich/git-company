// lib/__tests__/project-workflow.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProjectWorkflow } from "../baac/types";

// ── Harness de mocks (hoisted) ──
const companyFindUniqueMock = vi.fn();
const companyUpdateMock = vi.fn();
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

// setupProjectWorkflow usa o import estático; dashboard-service usa import dinâmico.
// Ambos resolvem para este mesmo módulo mockado.
vi.mock("@octokit/graphql", () => ({
  graphql: { defaults: () => (...a: unknown[]) => gqlMock(...a) },
}));

vi.mock("../db/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue({}),
}));

import { setupProjectWorkflow } from "../github/project-workflow";
import { stageStatusOptions } from "../github/dashboard-service";

const COLUMNS = ["Backlog", "Em Progresso", "Revisão", "Ação Manual", "Concluído"];

const config: ProjectWorkflow = {
  title: "Zas Organizer",
  views: [],
  columns: COLUMNS.map((name) => ({ name })),
};

beforeEach(() => {
  companyFindUniqueMock.mockReset().mockResolvedValue({
    id: "company-1",
    githubToken: "tok",
    projectId: "PVT_existing",
  });
  companyUpdateMock.mockReset().mockResolvedValue({});
  gqlMock.mockReset();
});

describe("setupProjectWorkflow (reconciliado — sem fuzzy mapping)", () => {
  it("delega ao caminho canônico: updateProjectV2Field com singleSelectOptions = stageStatusOptions(columns)", async () => {
    // Sequência de respostas conforme as queries emitidas:
    gqlMock.mockImplementation((query: string) => {
      const q = String(query);
      if (q.includes("viewer")) return Promise.resolve({ viewer: { id: "U_1", login: "zastrich" } });
      if (q.includes("ProjectV2 { url }") || q.includes("on ProjectV2 { url }")) {
        return Promise.resolve({ node: { url: "https://github.com/users/zastrich/projects/7" } });
      }
      if (q.includes("fields(first:50)") || q.includes("fields(first: 50)")) {
        return Promise.resolve({
          node: {
            fields: {
              nodes: [
                {
                  id: "FIELD_status",
                  name: "Status",
                  options: COLUMNS.map((name, i) => ({ id: `opt-${i}`, name })),
                },
              ],
            },
          },
        });
      }
      if (q.includes("updateProjectV2Field")) {
        return Promise.resolve({ updateProjectV2Field: { projectV2Field: { id: "FIELD_status" } } });
      }
      if (q.includes("createProjectV2View")) {
        return Promise.resolve({ createProjectV2View: { projectV2View: { id: "V_1" } } });
      }
      // node(id).url (projeto existente)
      return Promise.resolve({ node: { url: "https://github.com/users/zastrich/projects/7" } });
    });

    const result = await setupProjectWorkflow("company-1", config);
    expect(result).not.toBeNull();

    // encontrar a chamada da mutação updateProjectV2Field
    const updateCall = gqlMock.mock.calls.find((c) => String(c[0]).includes("updateProjectV2Field"));
    expect(updateCall).toBeDefined();
    const vars = updateCall![1] as { fieldId: string; options: unknown[] };
    expect(vars.fieldId).toBe("FIELD_status");
    // mesmas opções que o caminho canônico produziria
    expect(vars.options).toEqual(stageStatusOptions(COLUMNS));

    // garante que NÃO há mais fuzzy mapping (nenhuma referência a Todo/In Progress/Done geradas por ele)
    expect(result!.columnOptions.map((o) => o.name)).toEqual(COLUMNS);
  });
});
