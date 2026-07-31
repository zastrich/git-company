// lib/baac/types.ts

// ─────────────────────────────────────────────
// LLM Configuration
// ─────────────────────────────────────────────

export type LLMProvider = "openai" | "ollama" | "anthropic" | "groq" | "gemini" | "bedrock" | "moonshot";

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
// Agent Definition
// ─────────────────────────────────────────────

export interface AgentDefinition {
  agentId: string;
  role: string;
  llm: LLMConfig;
  /** System prompt — escopo e limites do agente */
  context: string;
  /** Intervalo entre ticks em segundos */
  tickIntervalSeconds: number;
  /** Labels do GitHub que este agente processa */
  labels: string[];
  /** IDs de agentes subordinados (para hierarquia) */
  subordinates?: string[];
}

// ─────────────────────────────────────────────
// Org Chart (legacy — mantido para compatibilidade)
// ─────────────────────────────────────────────

export interface AgentContext {
  agentId: string;
  role: string;
  context: string;
  subordinates?: string[];
}

export interface Department {
  leader: AgentContext;
  collaborators: AgentContext[];
}

export interface OrgChart {
  ceo: AgentContext;
  departments: Record<string, Department>;
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

export interface Project {
  title: string;
  views: View[];
}

export interface Workflow {
  file: string;
  content: string;
}

export interface Infrastructure {
  labels: Label[];
  milestones: Milestone[];
  project: Project;
  workflows: Workflow[];
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
  /** Lista flat de todos os agentes da empresa */
  agents: AgentDefinition[];
  infrastructure: Infrastructure;
  /** Org chart hierárquico (opcional, para visualização) */
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
