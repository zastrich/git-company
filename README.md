# GitCompany AI

**Business as a Code (BaaC)** — Plataforma de orquestração de empresas virtuais baseadas em agentes de IA, com infraestrutura declarativa no GitHub.

## O que é

GitCompany AI transforma um arquivo `business.json` em uma empresa virtual funcional no GitHub, com:
- Agentes de IA especializados (CEO, devs, designers, etc.)
- Infraestrutura automatizada (Labels, Milestones, Projects, Workflows)
- Scheduling configurável por agente (min 5 min)
- Chat interativo com cada agente
- Sync bidirecional com repositórios GitHub

## Stack

- **Runtime:** Bun + TypeScript
- **Framework:** Next.js 14+ (App Router)
- **AI:** LangChain.js (multi-provider)
- **Database:** SQLite via Prisma ORM
- **GitHub:** Octokit REST + GraphQL

## Providers de IA Suportados

| Provider | Tipo | Uso |
|----------|------|-----|
| OpenAI (ChatGPT) | API | `gpt-4o`, `gpt-4o-mini` |
| Anthropic (Claude) | API | `claude-3-sonnet`, `claude-3-opus` |
| Google Gemini | API | `gemini-pro`, `gemini-1.5-flash` |
| AWS Bedrock | API | Qualquer modelo Bedrock |
| Moonshot (Kimi K3) | API | `moonshot-v1-8k`, `moonshot-v1-128k` |
| Ollama | Local | `llama3`, `mistral`, `codellama` |
| Groq | API | `llama3-70b-8192` |

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

## CLI

```bash
# Criar empresa com repositório e CEO
bun run cli/tenant.ts company:create --name="Minha Empresa" --slug=minha-empresa --prefix=me- --token=ghp_xxx --owner=meu-user --mission="Construir o futuro"

# Listar providers de IA
bun run cli/tenant.ts provider:list

# Adicionar agente
bun run cli/tenant.ts agent:add --company=minha-empresa --agentId=dev --role="Backend Developer" --provider=openai --model=gpt-4o --context="Desenvolver APIs REST" --interval=600 --labels=backend,api

# Pausar/retomar agente
bun run cli/tenant.ts agent:pause --company=minha-empresa --agent=dev
bun run cli/tenant.ts agent:resume --company=minha-empresa --agent=dev

# Configurar secrets (API keys no banco, não em .env)
bun run cli/tenant.ts secret:set --company=minha-empresa --key=OPENAI_API_KEY --value=sk-xxx

# Sync bidirecional
bun run cli/tenant.ts company:sync --company=minha-empresa --direction=push
bun run cli/tenant.ts company:sync --company=minha-empresa --direction=pull

# Scheduler
bun run cli/tenant.ts scheduler:start --company=minha-empresa
bun run cli/tenant.ts scheduler:stop --company=minha-empresa
```

## Arquitetura

```
lib/
  agents/         # Factory, orchestrator, task queue, LLM factory
  baac/           # Types, diff engine
  chat/           # Chat service (contexto + LLM)
  db/             # Prisma client singleton, audit, secrets
  github/         # REST + GraphQL clients
  scheduler/      # Scheduler service, agent runner
  sync/           # Org sync bidirecional
app/
  api/            # Routes: webhook, scheduler, chat, sync
  dashboard/      # Frontend: overview, agents, chat, logs, scheduler
cli/              # CLI administrativa
scheduler/        # Entrypoint do scheduler
prisma/           # Schema + seed
.github/workflows # CI (testes) + Security (audit + secrets scan)
```

## Princípios

- **SOLID** em cada módulo
- **Zero secrets em ENV** — tudo no banco
- **Multi-tenant** com isolamento total
- **Testes unitários** com Vitest
- **CI/CD** com GitHub Actions

## License

Private
