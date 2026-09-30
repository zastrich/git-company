# GitCompany AI

**Business as a Code (BaaC)** — Plataforma de orquestração de projetos/empresas virtuais baseadas em agentes de IA, com o GitHub como fonte da verdade (issues, Projects V2, labels, milestones).

## O que é

O GitCompany AI transforma a descrição de um projeto em uma operação funcional no GitHub, com:

- **Onboarding assistido por IA** — descreva o projeto e uma LLM propõe o plano (etapas do fluxo, etiquetas, agentes/colaboradores). Você revisa e cria.
- **Importação de repositório existente** — lê o `business.json` do repo, reconstitui o estado local e permite trabalho paralelo em várias máquinas.
- **Agentes de IA especializados** (CEO/coordenador, devs, revisores, etc.) e colaboradores humanos, com organograma hierárquico.
- **Kanban integrado ao GitHub** — board com drag-and-drop, cards (issues) vinculados a agentes por label, criação/clonagem/relacionamento de cards, e GitHub Projects V2 (view Kanban + Status por etapa).
- **Roadmap (milestones) e Etiquetas** geridos direto no GitHub pela interface.
- **Chat interativo** com cada agente e **scheduling** configurável por agente (mín. 5 min, pause/resume).
- **Sync bidirecional** com o repositório (`business.json` modular).

## Stack

- **Runtime:** Node.js + TypeScript (via [tsx](https://tsx.is)) — cross-platform (Windows, macOS, Linux)
- **Framework:** Next.js 14+ (App Router)
- **AI:** LangChain.js (multi-provider)
- **Database:** SQLite via Prisma ORM
- **GitHub:** Octokit REST + GraphQL (criação de issues e Projects V2 via GraphQL)

## Providers de IA Suportados

Providers são configurados na tela **LLMs** (`/providers`); as credenciais ficam no banco (write-only).

| Provider | Tipo | Observações |
|----------|------|-------------|
| Google Gemini | `gemini` | Rápido e com contexto de até 1M tokens (ex.: `gemini-3.8-flash`). Sugerido como assistente padrão |
| OpenAI (ChatGPT) | `openai` | `gpt-4o`, `gpt-4o-mini` |
| Anthropic (Claude) | `anthropic` | `claude-3-5-sonnet`, etc. |
| AWS Bedrock | `bedrock` | Qualquer modelo Bedrock |
| Groq | `groq` | Inferência rápida (LPU) |
| Moonshot (Kimi) | `moonshot` | Compatível com OpenAI |
| Ollama | `ollama` | Local |
| **Custom (OpenAI-compatible)** | `custom` | Qualquer endpoint OpenAI-compatible via **URL + token** (ex.: NVIDIA NIM `https://integrate.api.nvidia.com/v1`) |
| **Kiro (CLI)** | `kiro-cli` | Integra o binário do Kiro CLI (requer um CLI/gateway headless que responda no stdout) |
| **Local (básico)** | `local` | Modelo determinístico offline, sem chave — útil para bootstrap/testes |

## Setup Local

```bash
# Instalar dependências
npm install

# Criar banco de dados
npm run db:push

# Seed dos providers de IA
npm run db:seed

# Rodar testes
npm test

# Dev server
npm run dev
```

Depois de subir o dev server:

1. Abra **Diagnóstico** e configure o **token GitHub global** (ver scopes abaixo).
2. Abra **LLMs** e cadastre ao menos um provider com credencial (ex.: Gemini).
3. Use **Novo Projeto** (onboarding com IA) ou **Importar Repositório** na home.

## Credenciais & Segredos (write-only)

Todos os tokens/segredos ficam **exclusivamente no banco** (tabela `CompanySecret`) e são **write-only**: podem ser gravados/substituídos, mas nunca são lidos de volta pela interface ou API. O `.env` contém apenas o necessário para o Prisma.

- **Credenciais de LLM:** por projeto ou globais (tenant de sistema), configuradas em LLMs/Configurações.
- **Token GitHub global:** configurado e validado na tela **Diagnóstico** (também acessível a qualquer momento), garantindo que app e CLI funcionem sem ajustes manuais.

## Token GitHub

O token global deve ter os seguintes scopes (validados na tela de Diagnóstico):

| Scope | Obrigatório | Uso |
|-------|-------------|-----|
| `repo` | Sim | Criar repos, issues, commits, webhooks |
| `project` | Sim | Criar/gerenciar GitHub Projects V2 |
| `read:org` | Sim | Ler informações de organização |
| `workflow` | Recomendado | Gerenciar GitHub Actions workflows |

Para criar um token: https://github.com/settings/tokens/new

Ou via CLI:
```bash
gh auth refresh -s repo,project,read:org,workflow
```

## CLI

A CLI roda em Node via tsx. Passe os argumentos após `--`.

```bash
# Criar empresa com repositório e CEO
npm run cli company:create -- --name="Minha Empresa" --slug=minha-empresa --prefix=me- --token=ghp_xxx --owner=meu-user --mission="Construir o futuro"

# Listar providers de IA
npm run cli provider:list

# Adicionar agente
npm run cli agent:add -- --company=minha-empresa --agentId=dev --role="Backend Developer" --provider=openai --model=gpt-4o --context="Desenvolver APIs REST" --interval=600 --labels=backend,api

# Pausar/retomar agente
npm run cli agent:pause -- --company=minha-empresa --agent=dev
npm run cli agent:resume -- --company=minha-empresa --agent=dev

# Configurar secrets (API keys no banco, não em .env)
npm run cli secret:set -- --company=minha-empresa --key=OPENAI_API_KEY --value=sk-xxx

# Sync bidirecional
npm run cli company:sync -- --company=minha-empresa --direction=push
npm run cli company:sync -- --company=minha-empresa --direction=pull

# Scheduler
npm run cli scheduler:start -- --company=minha-empresa
npm run cli scheduler:stop -- --company=minha-empresa
```

## Arquitetura

```
lib/
  agents/         # Factory, orchestrator, task queue, LLM factory, local-llm, kiro-cli-llm
  baac/           # Types, diff engine
  chat/           # Chat service (contexto + LLM)
  db/             # Prisma client, audit, secrets (write-only), system-tenant (credenciais globais)
  github/         # REST + GraphQL clients, dashboard-service (kanban/labels/milestones/Projects V2), global-token
  onboarding/     # architect (plano via IA), materialize (criar projeto), import (importar repo)
  repos/          # Repo service
  scheduler/      # Scheduler service, agent runner
  sync/           # Org sync (business.json modular), dirty (pendências de sync)
app/
  api/            # company, kanban, labels, milestones, repo, secrets, llms, diagnostics,
                  # onboarding (plan/create/import), chat, scheduler, sync, webhook, providers, agents
  dashboard/      # overview, agents, orgchart, kanban, roadmap, labels, chat, providers, scheduler, logs, settings
  onboarding/     # Wizard de criação com IA + importação
  providers/      # Configuração global de LLMs
  diagnostics/    # Diagnóstico do token GitHub global
cli/              # CLI administrativa (Node/tsx)
scheduler/        # Entrypoint do scheduler (Node/tsx)
prisma/           # Schema + seeds
.github/workflows # CI (lint + type-check + testes) + Security (audit + secrets scan)
```

## Modelo de dados no repositório (business.json modular)

O push grava uma estrutura modular no repositório:

```
business.json        # índice (nome, missão, refs)
agents/<agentId>.json # um arquivo por agente (detalhe completo)
workflow.json        # etapas do fluxo com contexto de input/output
```

O pull/import lê tanto o formato modular quanto o legado (monolítico).

## Princípios

- **SOLID** em cada módulo
- **Segredos write-only** — gravados no banco, nunca lidos de volta
- **GitHub como fonte da verdade** — kanban/labels/milestones/Projects direto na API; banco como cache
- **Multi-tenant** com isolamento total
- **Cross-platform** — roda em Windows, macOS e Linux (Node/tsx)
- **Testes unitários** com Vitest
- **CI/CD** com GitHub Actions

## License

Private
