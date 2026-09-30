// lib/github/dashboard-service.ts
//
// Serviço de leitura/escrita direta no GitHub para as telas do dashboard
// (etiquetas, milestones, kanban). GitHub é a fonte da verdade; o banco local
// serve apenas de cache/config. Usa o token GitHub global.

import { Octokit } from "@octokit/rest";
import { prisma } from "../db/client";
import { getGlobalGitHubToken } from "./global-token";

export interface RepoRef { owner: string; repo: string; token: string; companyId: string; }

/** Resolve owner/repo/token de um projeto pelo slug. Usa token global. */
export async function resolveRepo(companySlug: string): Promise<RepoRef> {
  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) throw new Error("Empresa não encontrada.");
  const token = (await getGlobalGitHubToken()) ?? company.githubToken;
  if (!token || token === "local-no-token") {
    throw new Error("Token GitHub não configurado. Abra o Diagnóstico.");
  }
  if (!company.githubOwner || company.githubOwner === "local" || !company.repoName) {
    throw new Error("Projeto sem repositório GitHub vinculado. Configure em Configurações.");
  }
  return { owner: company.githubOwner, repo: company.repoName, token, companyId: company.id };
}

function client(token: string) {
  return new Octokit({ auth: token });
}

// ─────────────────────────────────────────────
// LABELS
// ─────────────────────────────────────────────

export interface LabelDTO { name: string; color: string; description: string }

export async function listLabels(ref: RepoRef): Promise<LabelDTO[]> {
  const octokit = client(ref.token);
  const data = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner: ref.owner,
    repo: ref.repo,
    per_page: 100,
  });
  return data.map((l) => ({ name: l.name, color: l.color, description: l.description ?? "" }));
}

export async function createLabel(ref: RepoRef, label: LabelDTO) {
  const octokit = client(ref.token);
  await octokit.rest.issues.createLabel({
    owner: ref.owner,
    repo: ref.repo,
    name: label.name,
    color: label.color.replace(/^#/, ""),
    description: label.description,
  });
}

export async function updateLabel(ref: RepoRef, currentName: string, label: LabelDTO) {
  const octokit = client(ref.token);
  await octokit.rest.issues.updateLabel({
    owner: ref.owner,
    repo: ref.repo,
    name: currentName,
    new_name: label.name,
    color: label.color.replace(/^#/, ""),
    description: label.description,
  });
}

export async function deleteLabel(ref: RepoRef, name: string) {
  const octokit = client(ref.token);
  await octokit.rest.issues.deleteLabel({ owner: ref.owner, repo: ref.repo, name });
}

// ─────────────────────────────────────────────
// MILESTONES
// ─────────────────────────────────────────────

export interface MilestoneDTO {
  number?: number;
  title: string;
  description: string;
  dueOn: string | null;
  state: "open" | "closed";
  openIssues?: number;
  closedIssues?: number;
}

export async function listMilestones(ref: RepoRef): Promise<MilestoneDTO[]> {
  const octokit = client(ref.token);
  const data = await octokit.paginate(octokit.rest.issues.listMilestones, {
    owner: ref.owner,
    repo: ref.repo,
    state: "all",
    per_page: 100,
    sort: "due_on",
    direction: "asc",
  });
  return data.map((m) => ({
    number: m.number,
    title: m.title,
    description: m.description ?? "",
    dueOn: m.due_on ?? null,
    state: m.state as "open" | "closed",
    openIssues: m.open_issues,
    closedIssues: m.closed_issues,
  }));
}

export async function createMilestone(ref: RepoRef, ms: { title: string; description?: string; dueOn?: string | null }) {
  const octokit = client(ref.token);
  await octokit.rest.issues.createMilestone({
    owner: ref.owner,
    repo: ref.repo,
    title: ms.title,
    description: ms.description || undefined,
    due_on: ms.dueOn ? new Date(ms.dueOn).toISOString() : undefined,
  });
}

// ─────────────────────────────────────────────
// KANBAN (issues agrupadas por etapa via label de status)
// ─────────────────────────────────────────────
//
// Convenção de vínculo com agente: label "agent::<agentId>" indica o agente
// responsável; "agent::running" indica execução em andamento.
// Etapa (coluna): label "stage::<Nome>" OU estado open/closed como fallback.

export const AGENT_LABEL_PREFIX = "agent::";
export const STAGE_LABEL_PREFIX = "stage::";
export const AGENT_RUNNING_LABEL = "agent::running";

export interface KanbanCard {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed";
  stage: string;
  assignedAgent: string | null;
  running: boolean;
  labels: string[];
}

export interface StageContext {
  name: string;
  description?: string;
  input?: string;
  output?: string;
  isManualAction?: boolean;
  isDone?: boolean;
}

export interface KanbanColumn { name: string; cards: KanbanCard[]; context?: StageContext }

/**
 * Lê as issues do repo e as organiza em colunas pelo label stage::.
 * columns = etapas esperadas (do workflow local); issues sem stage caem em
 * "Backlog" (aberta) ou "Concluído" (fechada).
 */
export async function readKanban(ref: RepoRef, columns: string[]): Promise<KanbanColumn[]> {
  const octokit = client(ref.token);
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: ref.owner,
    repo: ref.repo,
    state: "all",
    per_page: 100,
  });

  const cols: string[] = columns.length ? columns : ["Backlog", "Em Progresso", "Concluído"];
  const doneCol = cols[cols.length - 1];
  const backlogCol = cols[0];

  const board: Record<string, KanbanCard[]> = {};
  for (const c of cols) board[c] = [];
  const extra: Record<string, KanbanCard[]> = {};

  for (const issue of issues) {
    // pular pull requests
    if ((issue as any).pull_request) continue;

    const labels = (issue.labels as any[]).map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);
    const stageLabel = labels.find((l) => l.startsWith(STAGE_LABEL_PREFIX));
    const agentLabel = labels.find((l) => l.startsWith(AGENT_LABEL_PREFIX) && l !== AGENT_RUNNING_LABEL);

    let stage = stageLabel ? stageLabel.slice(STAGE_LABEL_PREFIX.length) : "";
    if (!stage) stage = issue.state === "closed" ? doneCol : backlogCol;

    const card: KanbanCard = {
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      state: issue.state as "open" | "closed",
      stage,
      assignedAgent: agentLabel ? agentLabel.slice(AGENT_LABEL_PREFIX.length) : null,
      running: labels.includes(AGENT_RUNNING_LABEL),
      labels,
    };

    if (board[stage]) board[stage].push(card);
    else (extra[stage] ??= []).push(card);
  }

  const result: KanbanColumn[] = cols.map((c) => ({ name: c, cards: board[c] }));
  for (const [name, cards] of Object.entries(extra)) result.push({ name, cards });
  return result;
}

// ─────────────────────────────────────────────
// PROJECT V2 (existência / criação)
// ─────────────────────────────────────────────

/** Retorna o projectId salvo no banco, se houver. */
export async function getSavedProjectId(companyId: string): Promise<string | null> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { projectId: true } });
  return c?.projectId ?? null;
}

/**
 * Cria um GitHub Project V2 vinculado ao repositório (via owner) e o linka ao repo.
 * Persiste o projectId no banco. Reusa GraphQL.
 */
export async function createProjectV2(ref: RepoRef, title: string, stages: string[] = []): Promise<string> {
  const gql = await gqlClient(ref.token);

  // 1. resolver ownerId (user ou org) e repositoryId
  const idData: any = await gql(
    `query($owner:String!,$repo:String!){
       repository(owner:$owner,name:$repo){ id owner { id __typename } }
     }`,
    { owner: ref.owner, repo: ref.repo }
  );
  const ownerId = idData.repository.owner.id;
  const repositoryId = idData.repository.id;

  // 2. criar o Project V2
  const created: any = await gql(
    `mutation($ownerId:ID!,$title:String!){
       createProjectV2(input:{ownerId:$ownerId,title:$title}){ projectV2 { id } }
     }`,
    { ownerId, title }
  );
  const projectId = created.createProjectV2.projectV2.id;

  // 3. linkar o repositório ao projeto (best-effort)
  try {
    await gql(
      `mutation($projectId:ID!,$repositoryId:ID!){
         linkProjectV2ToRepository(input:{projectId:$projectId,repositoryId:$repositoryId}){ clientMutationId }
       }`,
      { projectId, repositoryId }
    );
  } catch { /* escopo pode não permitir — não bloqueia */ }

  // 4. configurar o campo "Status" com uma opção por etapa + criar view Kanban
  if (stages.length) {
    try { await configureProjectStatusAndBoard(ref.token, projectId, stages); } catch { /* best-effort */ }
  }

  await prisma.company.update({ where: { id: ref.companyId }, data: { projectId } });
  return projectId;
}

/**
 * Ajusta o campo single-select "Status" do Project V2 para conter exatamente
 * as etapas do kanban, e cria uma view no layout BOARD agrupada por Status.
 * (Projects V2 novos já vêm com Status = Todo/In Progress/Done; aqui
 * substituímos as opções pelas etapas do projeto.)
 */
export async function configureProjectStatusAndBoard(token: string, projectId: string, stages: string[]) {
  const gql = await gqlClient(token);

  // localizar o campo Status
  const fieldsData: any = await gql(
    `query($projectId:ID!){
       node(id:$projectId){ ... on ProjectV2 {
         fields(first:50){ nodes {
           ... on ProjectV2SingleSelectField { id name options { id name } }
         } }
       } }
     }`,
    { projectId }
  );
  const statusField = fieldsData.node.fields.nodes.find((f: any) => f?.name === "Status");
  if (!statusField) return;

  // definir as opções = etapas (cor cinza por padrão; a etapa "done" verde)
  const options = stages.map((name) => ({
    name,
    color: /concl|done|final/i.test(name) ? "GREEN" : /manual|revis|review/i.test(name) ? "YELLOW" : "GRAY",
    description: "",
  }));

  await gql(
    `mutation($fieldId:ID!,$options:[ProjectV2SingleSelectFieldOptionInput!]!){
       updateProjectV2Field(input:{fieldId:$fieldId, singleSelectOptions:$options}){
         projectV2Field { ... on ProjectV2SingleSelectField { id } }
       }
     }`,
    { fieldId: statusField.id, options }
  );

  // criar uma view BOARD agrupada por Status
  try {
    await gql(
      `mutation($projectId:ID!){
         createProjectV2View(input:{projectId:$projectId, name:"Kanban", layout:BOARD_LAYOUT}){ projectV2View { id } }
       }`,
      { projectId }
    );
  } catch { /* a view padrão já serve; não bloqueia */ }
}

// ─────────────────────────────────────────────
// RELACIONAMENTOS (via convenção de labels + corpo)
// ─────────────────────────────────────────────

export type RelationType = "parent" | "related" | "blocked-by" | "blocking";

/** Converte um relacionamento em label de convenção (ex: blocked-by:#42). */
function relationLabel(type: RelationType, targetNumber: number): string {
  return `${type}:#${targetNumber}`;
}

// ─────────────────────────────────────────────
// CRIAR / CLONAR ISSUE
// ─────────────────────────────────────────────

export interface CreateIssueInput {
  title: string;
  body?: string;
  stage?: string;             // vira label stage::<stage>
  agentId?: string | null;    // vira label agent::<agentId>
  milestoneNumber?: number | null;
  startDate?: string | null;  // incluída no corpo (GitHub issues não têm campo nativo)
  dueDate?: string | null;
  relations?: { type: RelationType; number: number }[];
  extraLabels?: string[];
}

function composeBody(input: CreateIssueInput): string {
  const parts: string[] = [];
  if (input.body) parts.push(input.body);

  const meta: string[] = [];
  if (input.startDate) meta.push(`- **Início previsto:** ${input.startDate}`);
  if (input.dueDate) meta.push(`- **Fim previsto:** ${input.dueDate}`);
  if (input.relations?.length) {
    for (const r of input.relations) {
      const verbo = r.type === "parent" ? "Card pai" : r.type === "related" ? "Relacionado a" : r.type === "blocked-by" ? "Bloqueado por" : "Bloqueia";
      meta.push(`- **${verbo}:** #${r.number}`);
    }
  }
  if (meta.length) parts.push(`\n---\n### Metadados\n${meta.join("\n")}`);
  return parts.join("\n");
}

function composeLabels(input: CreateIssueInput): string[] {
  const labels: string[] = [...(input.extraLabels ?? [])];
  if (input.stage) labels.push(`${STAGE_LABEL_PREFIX}${input.stage}`);
  if (input.agentId) labels.push(`${AGENT_LABEL_PREFIX}${input.agentId}`);
  for (const r of input.relations ?? []) labels.push(relationLabel(r.type, r.number));
  return labels;
}

/**
 * Cria uma issue via GraphQL (mutation createIssue) — o endpoint REST
 * POST /repos/.../issues está marcado como deprecated pelo GitHub.
 * Resolve labelIds e milestoneId a partir dos nomes/números.
 * Depois adiciona ao Project V2, se existir.
 */
export async function createIssue(ref: RepoRef, input: CreateIssueInput): Promise<number> {
  const octokit = client(ref.token);
  const gql = await gqlClient(ref.token);

  const labelNames = composeLabels(input);

  // 1. garantir que as labels existam e coletar seus node IDs
  const labelIds: string[] = [];
  if (labelNames.length) {
    const existing = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
      owner: ref.owner, repo: ref.repo, per_page: 100,
    });
    const byName = new Map(existing.map((l) => [l.name, l.node_id]));
    for (const name of labelNames) {
      let id = byName.get(name);
      if (!id) {
        // cria a label ausente (ex: stage::X, agent::Y, blocked-by:#N)
        const created = await octokit.rest.issues.createLabel({
          owner: ref.owner, repo: ref.repo, name, color: "ededed",
        }).catch(() => null);
        id = created?.data.node_id;
      }
      if (id) labelIds.push(id);
    }
  }

  // 2. resolver repositoryId e milestoneId
  const repoData: any = await gql(
    `query($owner:String!,$repo:String!){ repository(owner:$owner,name:$repo){ id } }`,
    { owner: ref.owner, repo: ref.repo }
  );
  const repositoryId = repoData.repository.id;

  let milestoneId: string | undefined;
  if (input.milestoneNumber) {
    try {
      const msData: any = await gql(
        `query($owner:String!,$repo:String!,$n:Int!){ repository(owner:$owner,name:$repo){ milestone(number:$n){ id } } }`,
        { owner: ref.owner, repo: ref.repo, n: input.milestoneNumber }
      );
      milestoneId = msData.repository.milestone?.id;
    } catch { /* milestone opcional */ }
  }

  // 3. criar a issue via mutation createIssue
  const res: any = await gql(
    `mutation($repositoryId:ID!,$title:String!,$body:String,$labelIds:[ID!],$milestoneId:ID){
       createIssue(input:{repositoryId:$repositoryId,title:$title,body:$body,labelIds:$labelIds,milestoneId:$milestoneId}){
         issue { number id }
       }
     }`,
    {
      repositoryId,
      title: input.title,
      body: composeBody(input),
      labelIds: labelIds.length ? labelIds : undefined,
      milestoneId,
    }
  );

  const issue = res.createIssue.issue;

  // 4. adicionar ao Project V2, se existir
  const projectId = await getSavedProjectId(ref.companyId);
  if (projectId && issue.id) {
    try { await addIssueToProject(ref.token, projectId, issue.id); } catch { /* best-effort */ }
  }

  return issue.number;
}

/** Clona uma issue existente (título "(cópia)", mesmo corpo e labels). */
export async function cloneIssue(ref: RepoRef, sourceNumber: number): Promise<number> {
  const octokit = client(ref.token);
  const { data: src } = await octokit.rest.issues.get({ owner: ref.owner, repo: ref.repo, issue_number: sourceNumber });
  const labels = (src.labels as any[]).map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);

  return createIssue(ref, {
    title: `${src.title} (cópia)`,
    body: src.body ?? "",
    extraLabels: labels,
    milestoneNumber: src.milestone?.number ?? null,
    relations: [{ type: "related", number: sourceNumber }],
  });
}

// ─────────────────────────────────────────────
// MOVER CARD (label stage:: + Status no Project V2)
// ─────────────────────────────────────────────

/**
 * Move um card para outra etapa:
 *  - troca a label stage::<antiga> por stage::<nova>
 *  - se a etapa destino for "done", fecha a issue; senão reabre
 *  - atualiza o campo Status no Project V2 (se o projeto e a opção existirem)
 */
export async function moveCard(ref: RepoRef, issueNumber: number, toStage: string, isDone: boolean) {
  const octokit = client(ref.token);
  const gql = await gqlClient(ref.token);
  const { data: issue } = await octokit.rest.issues.get({ owner: ref.owner, repo: ref.repo, issue_number: issueNumber });
  const labels = (issue.labels as any[]).map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);

  const newLabelNames = labels.filter((l: string) => !l.startsWith(STAGE_LABEL_PREFIX));
  newLabelNames.push(`${STAGE_LABEL_PREFIX}${toStage}`);

  // Resolve node IDs das labels (cria a stage:: se faltar).
  const existing = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner: ref.owner, repo: ref.repo, per_page: 100,
  });
  const byName = new Map(existing.map((l) => [l.name, l.node_id]));
  const labelIds: string[] = [];
  for (const name of newLabelNames) {
    let id = byName.get(name);
    if (!id) {
      const created = await octokit.rest.issues.createLabel({ owner: ref.owner, repo: ref.repo, name, color: "ededed" }).catch(() => null);
      id = created?.data.node_id;
    }
    if (id) labelIds.push(id);
  }

  // Atualiza via GraphQL updateIssue (REST issues.update está deprecated).
  await gql(
    `mutation($id:ID!,$state:IssueState!,$labelIds:[ID!]){
       updateIssue(input:{id:$id,state:$state,labelIds:$labelIds}){ issue { id } }
     }`,
    { id: issue.node_id, state: isDone ? "CLOSED" : "OPEN", labelIds }
  );

  // Atualiza o Status no Project V2 (best-effort)
  const projectId = await getSavedProjectId(ref.companyId);
  if (projectId && issue.node_id) {
    try { await setProjectItemStatus(ref.token, projectId, issue.node_id, toStage); } catch { /* opção pode não existir */ }
  }
}

// ─────────────────────────────────────────────
// PROJECT V2 helpers (GraphQL)
// ─────────────────────────────────────────────

async function gqlClient(token: string) {
  const { graphql } = await import("@octokit/graphql");
  return graphql.defaults({ headers: { authorization: `token ${token}` } });
}

/** Adiciona uma issue (por node_id) a um Project V2 e retorna o itemId. */
export async function addIssueToProject(token: string, projectId: string, contentId: string): Promise<string> {
  const gql = await gqlClient(token);
  const res: any = await gql(
    `mutation($projectId:ID!,$contentId:ID!){
       addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}){ item { id } }
     }`,
    { projectId, contentId }
  );
  return res.addProjectV2ItemById.item.id;
}

/**
 * Define o valor do campo "Status" (single select) de um item do Project V2,
 * casando pelo nome da opção (a etapa). Cria/garante o item primeiro.
 */
export async function setProjectItemStatus(token: string, projectId: string, contentId: string, optionName: string) {
  const gql = await gqlClient(token);

  // 1. garantir item no projeto
  const itemId = await addIssueToProject(token, projectId, contentId);

  // 2. achar o campo Status e a opção correspondente
  const fields: any = await gql(
    `query($projectId:ID!){
       node(id:$projectId){ ... on ProjectV2 {
         fields(first:50){ nodes {
           ... on ProjectV2SingleSelectField { id name options { id name } }
         } }
       } }
     }`,
    { projectId }
  );
  const statusField = fields.node.fields.nodes.find((f: any) => f?.name === "Status");
  if (!statusField) return;
  const option = statusField.options.find((o: any) => o.name.toLowerCase() === optionName.toLowerCase());
  if (!option) return;

  // 3. setar o valor
  await gql(
    `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){
       updateProjectV2ItemFieldValue(input:{projectId:$projectId,itemId:$itemId,fieldId:$fieldId,value:{singleSelectOptionId:$optionId}}){ clientMutationId }
     }`,
    { projectId, itemId, fieldId: statusField.id, optionId: option.id }
  );
}

/**
 * Adiciona TODAS as issues do repo ao Project V2 e define o Status de cada uma
 * conforme sua etapa (label stage::), para o board já aparecer organizado.
 */
export async function syncIssuesToProject(ref: RepoRef, projectId: string): Promise<number> {
  const octokit = client(ref.token);
  const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner: ref.owner, repo: ref.repo, state: "all", per_page: 100,
  });
  let count = 0;
  for (const issue of issues) {
    if ((issue as any).pull_request) continue;
    if (!issue.node_id) continue;
    const labels = (issue.labels as any[]).map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);
    const stageLabel = labels.find((l: string) => l.startsWith(STAGE_LABEL_PREFIX));
    const stage = stageLabel
      ? stageLabel.slice(STAGE_LABEL_PREFIX.length)
      : (issue.state === "closed" ? "Concluído" : "Backlog");
    try {
      // setProjectItemStatus garante o item no projeto e define o Status
      await setProjectItemStatus(ref.token, projectId, issue.node_id, stage);
      count++;
    } catch {
      // fallback: ao menos adiciona ao projeto
      try { await addIssueToProject(ref.token, projectId, issue.node_id); count++; } catch { /* já está */ }
    }
  }
  return count;
}

// ─────────────────────────────────────────────
// WORKFLOW (contexto das etapas, do repo modular)
// ─────────────────────────────────────────────

/** Lê o workflow.json do repo para trazer input/output/descrição por etapa. */
export async function readStageContexts(ref: RepoRef): Promise<StageContext[]> {
  const octokit = client(ref.token);
  try {
    const { data } = await octokit.rest.repos.getContent({ owner: ref.owner, repo: ref.repo, path: "workflow.json" });
    if (Array.isArray(data) || (data as any).type !== "file") return [];
    const text = Buffer.from((data as any).content, "base64").toString("utf-8");
    const wf = JSON.parse(text);
    return (wf.stages ?? []) as StageContext[];
  } catch {
    return [];
  }
}
