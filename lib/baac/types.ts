// lib/baac/types.ts

// ─────────────────────────────────────────────
// LLM Configuration
// ─────────────────────────────────────────────

export type LLMProvider = "openai" | "ollama" | "anthropic" | "groq" | "gemini" | "bedrock" | "moonshot" | "local" | "custom" | "kiro-cli";

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  /** API key — pode ser um placeholder de secret: {{SECRET_NAME}} */
  apiKey?: string;
  /** Base URL para providers locais como Ollama */
  baseUrl?: string;
  temperature?: number;
  /** Max tokens gerados por resposta */
  maxTokens?: number;
}

// ─────────────────────────────────────────────
// MCP Server Configuration
// ─────────────────────────────────────────────

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

// ─────────────────────────────────────────────
// CLI Tool Configuration
// ─────────────────────────────────────────────

export interface CliArgSpec {
  /** Literal inserido verbatim no argv (ex.: "--json"). Mutuamente exclusivo com param. */
  literal?: string;
  /** Nome do parâmetro preenchido pela LLM (vira propriedade no schema da ferramenta). */
  param?: string;
  /** Se o param é obrigatório na tool-call. Default false. Ignorado quando literal. */
  required?: boolean;
  /** Descrição exibida à LLM no schema (apenas para param). */
  description?: string;
}

export interface CliToolConfig {
  /** Identificador único; vira o name da ferramenta LangChain. */
  id: string;
  /** Nome legível (rastreamento/UI). */
  name: string;
  /** Descrição exibida à LLM. */
  description: string;
  /** Comando-base FIXO (ex.: "gh", "notion", "gcloud"). Nunca vem da LLM. */
  command: string;
  /** Especificação ordenada do argv após o comando. */
  args: CliArgSpec[];
  /** Timeout em ms. Default 30000, teto 120000. */
  timeoutMs?: number;
  /** Variáveis de ambiente; valores podem conter {{SECRET}}. */
  env?: Record<string, string>;
}

// ─────────────────────────────────────────────
// Agent / Member Definition
// ─────────────────────────────────────────────

export type MemberType = "ai" | "human";

export interface AgentDefinition {
  agentId: string;
  role: string;
  /** Tipo do membro: "ai" (agente LLM) ou "human" (pessoa real) */
  type: MemberType;
  /** Config de LLM — obrigatório para type="ai", ignorado para "human" */
  llm: LLMConfig;
  /** System prompt — escopo e limites do agente */
  context: string;
  /** Intervalo entre ticks em segundos (apenas para type="ai") */
  tickIntervalSeconds: number;
  /** Labels do GitHub que este membro processa */
  labels: string[];
  /** IDs de agentes/membros subordinados (para hierarquia) */
  subordinates?: string[];
  /** GitHub username (para humans — usado em assignees) */
  githubUsername?: string;
  /** MCP Servers que este agente pode utilizar via LLM */
  mcpServers?: McpServerConfig[];
  /** Ferramentas CLI que este agente pode utilizar via LLM */
  cliTools?: CliToolConfig[];
  /** Caminhos .md (relativos ao workspace) com contexto grande do agente */
  contextFiles?: string[];
  /**
   * True quando este agente é o CEO/raiz do organograma.
   * Persistido APENAS para round-trip do business.json — não é propriedade
   * de runtime (o orchestrator não consome este flag; vem undefined em
   * runtime por construção via toAgentDefinition).
   */
  isCeo?: boolean;
}

// ─────────────────────────────────────────────
// Org Chart
// ─────────────────────────────────────────────

export interface OrgMember {
  agentId: string;
  role: string;
  type: MemberType;
  context: string;
  subordinates?: string[];
  githubUsername?: string;
}

export interface Department {
  leader: OrgMember;
  collaborators: OrgMember[];
}

export interface OrgChart {
  ceo: OrgMember;
  departments: Record<string, Department>;
}

// ─────────────────────────────────────────────
// Project Workflow (GitHub Project V2 columns)
// ─────────────────────────────────────────────

export interface WorkflowColumn {
  /** Nome da coluna no Project Board */
  name: string;
  /** Descrição do propósito da coluna */
  description?: string;
  /** Se esta coluna é para ações manuais (humanos) */
  isManualAction?: boolean;
  /** Se issues nesta coluna são consideradas "done" (auto-close) */
  isDone?: boolean;
}

export interface ProjectWorkflow {
  /** Título do GitHub Project V2 */
  title: string;
  /** Views do projeto (Board, Roadmap, Table) */
  views: View[];
  /** Colunas de status (fluxo de trabalho) */
  columns: WorkflowColumn[];
}

export type Project = ProjectWorkflow;

// ─────────────────────────────────────────────
// Issue Lifecycle Configuration
// ─────────────────────────────────────────────

export interface IssueLifecycle {
  /** Padrões de texto que indicam conclusão (ex: "[TAREFA_CONCLUÍDA]") */
  completionPatterns: string[];
  /** Quando concluída, mover para qual coluna? */
  completionColumn: string;
  /** Auto-close a issue quando o padrão de conclusão é detectado? */
  autoClose: boolean;
  /** Coluna inicial ao criar uma issue */
  defaultColumn: string;
  /** Coluna para issues que requerem ação manual */
  manualActionColumn: string;
}

// ─────────────────────────────────────────────
// Infrastructure
// ─────────────────────────────────────────────

export interface Label {
  name: string;
  color: string;
  description: string;
}

export interface Milestone {
  title: string;
  description: string;
  due_on: string;
}

export interface View {
  name: string;
  layout: "BOARD" | "ROADMAP" | "TABLE";
}

export interface Workflow {
  file: string;
  content: string;
}

export interface Infrastructure {
  labels: Label[];
  milestones: Milestone[];
  /** Config do projeto GitHub — agora com workflow de colunas */
  project: ProjectWorkflow;
  workflows: Workflow[];
  /** Config do ciclo de vida de issues */
  issueLifecycle?: IssueLifecycle;
}

// ─────────────────────────────────────────────
// Company Repository Reference
// ─────────────────────────────────────────────

export interface RepoReference {
  shortId: string;
  fullName: string;
  label: string;
  description?: string;
}

// ─────────────────────────────────────────────
// Business Configuration (business.json root)
// ─────────────────────────────────────────────

export interface BusinessConfig {
  companyName: string;
  mission?: string;
  version: string;
  /** Lista flat de todos os membros da empresa (AI + humanos) */
  agents: AgentDefinition[];
  infrastructure: Infrastructure;
  /** Org chart hierárquico (com humanos e IAs) */
  orgChart?: OrgChart;
  /** Repositórios gerenciados pela empresa */
  repos?: RepoReference[];
}

// ─────────────────────────────────────────────
// GitHub Issue Relationships
// ─────────────────────────────────────────────

export interface IssueRelation {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
}

export interface IssueContext {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  url: string;
  /** Issue pai (Add parent) */
  parent: IssueRelation | null;
  /** Issues que bloqueiam esta (blocked by) */
  blockedBy: IssueRelation[];
  /** Issues que esta bloqueia (blocking) */
  blocking: IssueRelation[];
}
