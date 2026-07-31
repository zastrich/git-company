# Plano Clássico de Implementação & Lista de Tarefas (WBS)
## Projeto: GitCompany-AI (BaaC ULTIMATE EDITION - V4)

Este documento apresenta o plano detalhado de implementação técnica para a plataforma **GitCompany-AI**, transformando a especificação do modelo **Business as a Code (BaaC)** em um roadmap de execução sequencial, estruturado por fases, marcos (milestones) e checklists de tarefas acionáveis.

---

## Requisitos Transversais (Aplicáveis a Todos os Módulos)

### Testes Unitários
- Todos os módulos devem possuir testes unitários com cobertura mínima de 80%.
- Framework de testes: **Vitest** (compatível com Bun e TypeScript nativo).
- Cada módulo deve ter seu arquivo de teste correspondente em `__tests__/` ou `*.test.ts`.
- Testes devem validar cenários de sucesso, erro e edge cases.

### Princípios SOLID
- **S** (Single Responsibility): Cada arquivo/classe deve ter uma única responsabilidade. Nenhum arquivo deve acumular múltiplas funções.
- **O** (Open/Closed): Módulos extensíveis sem modificação (ex: LLM factory via switch/plugin pattern).
- **L** (Liskov Substitution): Providers de IA devem ser intercambiáveis via interface comum.
- **I** (Interface Segregation): Interfaces pequenas e focadas por domínio.
- **D** (Dependency Inversion): Dependências injetadas, nunca instanciadas diretamente em alto nível.

### Configurações na Base de Dados
- **ZERO chaves de API em variáveis de ambiente (.env)**. Todas as configurações (tokens, API keys, URLs) ficam na base de dados SQLite local via tabela `CompanySecret`.
- O `.env` contém apenas o `DATABASE_URL` para o Prisma.

### Cenários de IA Suportados (API Online + CLI Local)
| Provider | Tipo | Pacote LangChain |
|----------|------|-----------------|
| ChatGPT (OpenAI) | API Online | `@langchain/openai` |
| Claude (Anthropic) | API Online | `@langchain/anthropic` |
| Kiro (AWS) | API Online | `@langchain/aws` (Bedrock) |
| Kimi K3 (Moonshot) | API Online | `@langchain/openai` (compatível OpenAI) |
| Gemini (Google) | API Online | `@langchain/google-genai` |
| Ollama | CLI Local | `@langchain/ollama` |
| AWS Bedrock | API Online | `@langchain/aws` |

---

## Stack Tecnológica & Requisitos de Arquitetura

* **Runtime Executivo & CLI:** Bun (TypeScript nativo, alta performance na execução de scripts e CLI).
* **Framework Frontend & API:** Next.js 14+ (App Router, Server Components e Dynamic Route Handlers).
* **Orquestração de Agentes IA:** LangChain.js (multi-provider: OpenAI, Anthropic, Google, AWS Bedrock, Ollama, Moonshot/Kimi).
* **Camada de Persistência:** SQLite gerenciado via Prisma ORM (`file:./main.db`).
* **Integrações Externas:**
  * **GitHub REST API (v3):** Octokit para Labels, Milestones e alteração de arquivos de Workflows CI/CD.
  * **GitHub GraphQL API (v4):** Manipulação e criação de GitHub Projects v2 e Views customizadas.
* **Segurança:** Autenticação HMAC-SHA256 por Tenant para Webhooks, Isolamento Multitenant no SQLite.
* **Testes:** Vitest com cobertura e mocks.
* **CI/CD:** GitHub Actions (testes + segurança).

---

## Visão Geral do Roadmap de Implementação

```
[Fase 1: Foundation & Setup] -> [Fase 2: Schema & Multitenancy DB] -> [Fase 3: Core Integration APIs GitHub]
                                                                              |
[Fase 6: CLI Tooling] <------ [Fase 5: Webhook Engine] <------ [Fase 4: Motor Multi-AI BaaC]
          |
          v
[Fase 7: Dashboard Web Next.js] -> [Fase 8: Chat & Interação] -> [Fase 9: QA, CI/CD & Lançamento]
```

---

## Lista de Tarefas Detalhada (Work Breakdown Structure)

### Fase 1: Setup do Projeto e Arquitetura de Base
**Objetivo:** Configurar o ambiente unificado com Bun, Next.js 14, Prisma e tipagem rigorosa para a especificação `business.json`.

- [x] **1.1. Inicialização do Repositório e Toolchain**
  - [x] Inicializar o projeto utilizando Bun (`bun init` / `bun create next-app`).
  - [x] Configurar `tsconfig.json` com caminhos de alias (`@/*`) e suporte estrito do TypeScript.
  - [x] Instalar dependências essenciais: `@prisma/client`, `prisma`, `octokit`, `@langchain/openai`, `@langchain/core`, `zod`.
- [x] **1.2. Definição dos Types para o `business.json`**
  - [x] Criar types TypeScript para a especificação do `business.json` (`lib/baac/types.ts`).
  - [x] Suporte a `infrastructure` (labels, milestones, project, workflows).
  - [x] Suporte a `agents` (flat list com LLM config por agente).
  - [x] Suporte a `orgChart` (CEO, departments, hierarquia).
- [x] **1.3. Gestão de Variáveis de Ambiente e Configurações**
  - [x] Configurar `.env` com apenas `DATABASE_URL`.
  - [x] Todas as demais configurações (tokens, API keys) ficam no banco via `CompanySecret`.

---

### Fase 2: Camada de Dados e Modelagem Multitenant (SQLite + Prisma)
**Objetivo:** Estabelecer a persistência local com isolamento multitenant estrito para credenciais, configurações e auditoria.

- [x] **2.1. Criação do Schema do Prisma**
  - [x] Configurar o arquivo `prisma/schema.prisma` direcionado ao provider `sqlite`.
  - [x] Modelo `Company` (id, name, slug, githubOwner, githubToken, webhookSecret, repoName, projectId, timestamps).
  - [x] Modelo `AuditLog` (id, companyId, agentId, agentName, action, details, createdAt).
  - [x] Modelo `CompanySecret` (id, companyId, key, value, unique constraint).
  - [x] Modelo `SchedulerProcess` (id, companyId, pid, status, timestamps).
- [ ] **2.2. Novos Modelos (V4 Extended)**
  - [ ] Modelo `AIProvider` (id, name, slug, type, baseUrl, isLocal, createdAt) — catálogo global de providers.
  - [ ] Modelo `AgentConfig` (id, companyId, agentId, role, context, providerId, model, tickIntervalSeconds, labels, isPaused, createdAt, updatedAt).
  - [ ] Modelo `ChatMessage` (id, companyId, agentId, role, content, createdAt) — histórico de chat com agentes.
  - [ ] Modelo `CompanyConfig` (id, companyId, key, value) — configurações gerais da empresa.
  - [ ] Adicionar campo `repoPrefix` no modelo `Company` (slug prefix para repos: "comp-").
- [x] **2.3. Data Access Layer (DAO) com Contexto Tenant**
  - [x] Implementar serviço de busca de empresa por `slug`.
  - [x] Implementar gravador de logs de auditoria isolado (`lib/db/audit.ts`).
  - [x] Implementar gestão de secrets com interpolação (`lib/db/secrets.ts`).

---

### Fase 3: Módulo de Integração com APIs do GitHub (REST v3 & GraphQL v4)
**Objetivo:** Construir o conector bidirecional para gerenciamento remoto de infraestrutura, projetos e workflows do GitHub.

- [x] **3.1. Abstração do Cliente GitHub Multitenant**
  - [x] Criar cliente REST parametrizado pelo token do Tenant (`lib/github/rest.ts`).
  - [x] Criar cliente GraphQL com suporte a relationships (`lib/github/graphql.ts`).
- [x] **3.2. Sincronização Estrita de Labels e Milestones (REST API)**
  - [x] Implementar algoritmo Diferencial (Diff Engine) para labels.
  - [x] Implementar algoritmo Diferencial para milestones.
- [x] **3.3. Injeção Autônoma de Workflows (.github/workflows)**
  - [x] Criar gerenciador de arquivos via Content API do Octokit.
  - [x] Efetuar commit automático adicionando ou atualizando arquivos YAML.
- [x] **3.4. Provisionamento de Projects v2 e Views Customizadas (GraphQL)**
  - [x] Implementar mutação GraphQL para criação de views em Projects v2.
  - [x] Mapear layouts (BOARD, ROADMAP, TABLE) para enums da GraphQL API.
- [ ] **3.5. Sync Bidirecional de Configurações (Novo)**
  - [ ] Função `pushConfigToRepo`: enviar business.json local para o repositório remoto.
  - [ ] Função `pullConfigFromRepo`: baixar business.json do repo e atualizar banco local.
  - [ ] Ao modificar orgChart localmente, push automático para o repositório da empresa.

---

### Fase 4: Orquestração Dinâmica de Agentes de IA (Multi-Provider)
**Objetivo:** Instanciar agentes especializados sob demanda usando LangChain com suporte a múltiplos providers de IA.

- [x] **4.1. LLM Factory Multi-Provider**
  - [x] Suporte a OpenAI (ChatGPT).
  - [x] Suporte a Anthropic (Claude).
  - [x] Suporte a Ollama (local).
  - [x] Suporte a Groq.
  - [ ] Suporte a Google Gemini (`@langchain/google-genai`).
  - [ ] Suporte a AWS Bedrock (`@langchain/aws`).
  - [ ] Suporte a Kimi K3 / Moonshot (via OpenAI-compatible endpoint).
- [x] **4.2. Factory Dynamic Agent com LangChain**
  - [x] Função `createDynamicAgent(agentConfig, companyMission)` implementada.
  - [x] System Prompt com role, mission e context injetados.
  - [x] Cadeia executável via `RunnableSequence`.
- [x] **4.3. Sistema de Execução e Registro de Atividades**
  - [x] Orquestrador de tarefas dos agentes (`lib/agents/orchestrator.ts`).
  - [x] Task queue com resolução de dependências via GitHub Issues (`lib/agents/task-queue.ts`).
  - [x] Integração com AuditLog (TASK_PROCESSED, TASK_BLOCKED, TASK_ERROR).

---

### Fase 5: Engine de Webhooks Multitenant (Next.js Route Handlers)
**Objetivo:** Processar notificações em tempo real do GitHub garantindo isolamento total por tenant e verificação criptográfica HMAC.

- [x] **5.1. Construção da Rota Dinâmica de Webhook**
  - [x] Endpoint em `app/api/webhook/[companySlug]/route.ts`.
  - [x] Extração do `companySlug` e busca de credenciais no SQLite.
  - [x] Retorno `404` caso a empresa não esteja cadastrada.
- [x] **5.2. Validação Criptográfica de Assinatura (HMAC-SHA256)**
  - [x] Extração do header `x-hub-signature-256`.
  - [x] Cálculo do digest HMAC com `crypto.createHmac`.
  - [x] Comparação com `crypto.timingSafeEqual`.
  - [x] Retorno `401` em caso de divergência.
- [x] **5.3. Roteamento de Eventos e Gatilhos Autônomos**
  - [x] Identificação do evento via `x-github-event`.
  - [x] Tratamento de push (detecção de modificação no `business.json`).
  - [x] Tratamento de Issues/PRs com registro no AuditLog.

---

### Fase 6: Interface de Linha de Comando (CLI via Bun)
**Objetivo:** Disponibilizar ferramentas de CLI velozes para provisionamento e sincronização manual de empresas virtuais.

- [x] **6.1. Comandos Implementados**
  - [x] `tenant:create` — Criar empresa no banco local.
  - [x] `tenant:list` — Listar empresas.
  - [x] `scheduler:start` — Iniciar scheduler em background.
  - [x] `scheduler:stop` — Parar scheduler.
  - [x] `scheduler:status` — Verificar status do scheduler.
  - [x] `agent:run` — Disparar agentes imediatamente.
  - [x] `secret:set` — Definir um secret.
  - [x] `secret:list` — Listar secrets (mascarados).
- [ ] **6.2. Novos Comandos (V4 Extended)**
  - [ ] `company:create` — Criar empresa com slug prefix, repo de organograma, e CEO inicial.
  - [ ] `company:sync` — Sync bidirecional (pull/push) de configurações.
  - [ ] `provider:list` — Listar providers de IA configurados.
  - [ ] `provider:add` — Adicionar novo provider de IA ao catálogo.
  - [ ] `agent:pause` — Pausar um agente sem perder configurações.
  - [ ] `agent:resume` — Retomar um agente pausado.
  - [ ] `agent:chat` — Interagir com um agente via CLI (modo interativo).

---

### Fase 7: Interface Frontend & Painel de Telemetria (Next.js 14 App Router)
**Objetivo:** Desenvolver o painel de monitoramento e edição do ecossistema multitenant.

- [x] **7.1. Seletor Global de Tenant & Navegação**
  - [x] Componente de Header com lista de empresas ativas.
  - [x] Navegação contextualizada sob `/dashboard/[companySlug]`.
- [x] **7.2. Painel de Agentes**
  - [x] Cards visuais para cada agente com provider, model, labels e tick interval.
- [x] **7.3. Dashboard de Overview**
  - [x] Status do scheduler, PID, secrets count, últimos eventos.
- [x] **7.4. Log de Auditoria**
  - [x] Tabela com últimos 100 eventos.
- [x] **7.5. Controle de Scheduler**
  - [x] Interface para iniciar/parar scheduler com status em tempo real.
- [ ] **7.6. Novos Componentes (V4 Extended)**
  - [ ] Página de configuração de providers de IA (CRUD no banco).
  - [ ] Botão de pause/resume por agente.
  - [ ] Página de configurações da empresa (edição local + sync).

---

### Fase 8: Sistema de Chat & Interação com Agentes (Novo)
**Objetivo:** Permitir interação direta com cada agente via chat, com controle de janela de contexto.

- [ ] **8.1. Backend de Chat**
  - [ ] API Route `POST /api/chat/[companySlug]/[agentId]` para enviar mensagem.
  - [ ] API Route `GET /api/chat/[companySlug]/[agentId]` para listar histórico.
  - [ ] Parâmetro `contextWindow` (30d, 90d, all) para filtrar mensagens enviadas como contexto ao LLM.
  - [ ] Persistência de mensagens na tabela `ChatMessage`.
- [ ] **8.2. Frontend de Chat**
  - [ ] Página `/dashboard/[companySlug]/chat/[agentId]` com interface de chat.
  - [ ] Seletor de janela de contexto (últimos 30 dias, 90 dias, todo período).
  - [ ] Exibição do histórico de conversas.
  - [ ] Indicador de "digitando" enquanto o LLM processa.
- [ ] **8.3. Preparação de Contexto**
  - [ ] Ao enviar mensagem, carregar histórico conforme janela selecionada.
  - [ ] Injetar system prompt do agente + histórico + nova mensagem.
  - [ ] Registrar resposta no banco.

---

### Fase 9: Scheduling Avançado & Pause/Resume (Novo)
**Objetivo:** Permitir configuração granular de intervalos por agente com suporte a pause/resume.

- [ ] **9.1. Configuração de Intervalos**
  - [ ] Tempo mínimo: 5 minutos (300 segundos). Sem tempo máximo.
  - [ ] Configurável por agente individualmente.
  - [ ] Validação: rejeitar intervalos < 300s.
- [ ] **9.2. Pause/Resume de Agentes**
  - [ ] Campo `isPaused` na tabela `AgentConfig`.
  - [ ] Agentes pausados são ignorados pelo scheduler sem perder configs.
  - [ ] CLI `agent:pause` e `agent:resume`.
  - [ ] API e UI para toggle de pause/resume.
- [ ] **9.3. Lista de Agentes Antes da Empresa**
  - [ ] A configuração de providers/agentes deve ser feita ANTES da criação da empresa e do CEO.
  - [ ] Fluxo: configurar providers -> configurar agentes -> criar empresa -> CEO é atribuído automaticamente.

---

### Fase 10: Criação de Empresa & Org Sync (Novo)
**Objetivo:** Ao criar uma empresa, gerar slug prefix, repositório inicial e CEO agent.

- [ ] **10.1. Slug Prefix para Repositórios**
  - [ ] Cada empresa tem um `repoPrefix` (ex: "comp-") que prefixa todos os repos criados por seus agentes.
  - [ ] Primeiro repositório: `{prefix}org` — contém o organograma (`business.json`).
- [ ] **10.2. Criação Automática de Repositório**
  - [ ] Ao criar empresa via CLI/API:
    1. Gravar no banco local.
    2. Criar repo `{prefix}org` no GitHub.
    3. Fazer commit inicial com `business.json` contendo CEO.
    4. Registrar webhook apontando para a aplicação.
- [ ] **10.3. CEO Agent Inicial**
  - [ ] Toda empresa inicia com um CEO agent.
  - [ ] CEO tem instruções para "contratar" (criar) novos agentes baseado na missão.
  - [ ] System prompt do CEO inclui: missão da empresa, capacidade de delegação, e instrução de criação de subordinados.
- [ ] **10.4. Sync de Organograma**
  - [ ] Ao modificar o orgChart pela ferramenta local, push automático para o repo da empresa.
  - [ ] Sync bidirecional: atualizar local conforme repo OU enviar alterações locais para o repo.
  - [ ] Ambas as direções disponíveis via CLI (`company:sync --direction=push|pull`).

---

### Fase 11: Testes, CI/CD & Segurança
**Objetivo:** Garantir robustez, isolamento e performance da plataforma com pipeline automatizada.

- [ ] **11.1. Testes Unitários por Módulo**
  - [ ] `lib/agents/llm-factory.test.ts` — Factory de LLMs.
  - [ ] `lib/agents/factory.test.ts` — Agent factory.
  - [ ] `lib/agents/orchestrator.test.ts` — Orquestrador.
  - [ ] `lib/agents/task-queue.test.ts` — Task queue.
  - [ ] `lib/baac/diff.test.ts` — Diff engine.
  - [ ] `lib/db/audit.test.ts` — Audit log DAO.
  - [ ] `lib/db/secrets.test.ts` — Secrets com interpolação.
  - [ ] `lib/github/rest.test.ts` — GitHub REST client.
  - [ ] `lib/github/graphql.test.ts` — GitHub GraphQL client.
- [ ] **11.2. Pipeline CI/CD (GitHub Actions)**
  - [ ] Workflow `ci.yml`: lint + type-check + testes unitários em push/PR.
  - [ ] Workflow `security.yml`: audit de dependências + scan de secrets.
  - [ ] Trigger condicional: rodar testes apenas quando arquivos relevantes mudarem (paths filter).
- [ ] **11.3. Testes de Segurança**
  - [ ] Testar isolamento multitenant (tokens não vazam entre tenants).
  - [ ] Simular payloads falsos de Webhook para validar rejeição HMAC.
  - [ ] Validar que secrets nunca aparecem em logs.

---

## Matriz de Dependências Técnicas

| Módulo | Depende de | Impacto no Bloqueio |
| :--- | :--- | :--- |
| **Fase 2 (Prisma/SQLite)** | Fase 1 (Setup Bun/Next.js) | Critico |
| **Fase 3 (GitHub APIs)** | Fase 2 (Tokens dos Tenants) | Critico |
| **Fase 4 (Multi-AI Motor)** | Fase 2 (Secrets) + Fase 3 (Repos) | Alto |
| **Fase 5 (Webhook Engine)** | Fase 2 & Fase 4 | Critico |
| **Fase 6 (CLI Tools)** | Fase 2 & Fase 3 | Medio |
| **Fase 7 (Dashboard Frontend)**| Fase 2, 3, 4 & 5 | Medio |
| **Fase 8 (Chat)** | Fase 4 (AI) + Fase 2 (DB) | Medio |
| **Fase 9 (Scheduling)** | Fase 4 + Fase 6 | Medio |
| **Fase 10 (Company/Org)** | Fase 3 + Fase 6 + Fase 9 | Alto |
| **Fase 11 (CI/CD)** | Todas as fases | Baixo (pode rodar em paralelo) |

---

## Critérios de Aceite Globais
1. **Zero Código de Infraestrutura Manual:** Toda a estrutura do GitHub deve ser gerada a partir do `business.json`.
2. **Isolamento Total por Tenant:** Nenhum tenant pode acessar segredos ou logs de outro tenant.
3. **Reatividade a Alterações:** Modificações no `business.json` reconfiguram infraestrutura automaticamente via Webhook.
4. **Multi-AI Transparente:** Trocar de provider (OpenAI -> Gemini -> Ollama) deve ser apenas uma mudança de config.
5. **Chat Contextualizado:** Cada agente mantém histórico e responde dentro do seu escopo.
6. **Scheduling Flexível:** Mínimo 5min, sem máximo, pause/resume sem perda de config.
7. **Sync Bidirecional:** Alterações locais sobem para o repo; alterações no repo descem para o local.
8. **Zero Secrets em ENV:** Todas as chaves ficam exclusivamente na base de dados.
9. **Testes Automatizados:** Cobertura mínima 80%, CI/CD rodando em todo PR.
10. **SOLID em Todo Módulo:** Cada arquivo = uma responsabilidade. Extensível sem modificação.
