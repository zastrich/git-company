import { prisma } from "../lib/db/client";
import Link from "next/link";
import { Building2, ChevronRight, Activity, CalendarDays, Sparkles, Download, Server, Stethoscope, AlertTriangle } from "lucide-react";
import { hasGlobalGitHubToken } from "../lib/github/global-token";

// Lê o banco em tempo de requisição — não pré-renderizar no build (sem DATABASE_URL no CI).
export const dynamic = "force-dynamic";

export default async function GlobalSelector() {
  const companies = await prisma.company.findMany({
    where: { slug: { not: "__system__" } },
    include: {
      schedulers: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  const githubConfigured = await hasGlobalGitHubToken();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans p-8 md:p-16">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                GitCompany AI
              </h1>
              <p className="text-zinc-400 mt-1">
                Seletor Global de Tenants
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/diagnostics"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-sm transition-all border border-zinc-700"
            >
              <Stethoscope className="w-4 h-4" />
              Diagnóstico
            </Link>
            <Link
              href="/providers"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-sm transition-all border border-zinc-700"
            >
              <Server className="w-4 h-4" />
              LLMs
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/20"
            >
              <Sparkles className="w-4 h-4" />
              Novo Projeto
            </Link>
            <Link
              href="/onboarding/import"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-sm transition-all border border-zinc-700"
            >
              <Download className="w-4 h-4" />
              Importar Repositório
            </Link>
          </div>
        </header>

        {!githubConfigured && (
          <Link href="/diagnostics" className="block mb-8">
            <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-950/10 flex items-center gap-3 hover:bg-amber-950/20 transition-colors">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Token GitHub não configurado</p>
                <p className="text-xs text-zinc-400">Configure o token global para que a aplicação e a CLI funcionem sem ajustes manuais. Clique para abrir o diagnóstico.</p>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-400" />
            </div>
          </Link>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {companies.length === 0 ? (
            <div className="col-span-full p-8 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 flex flex-col items-center justify-center text-center">
              <Building2 className="w-12 h-12 text-zinc-600 mb-4" />
              <h3 className="text-xl font-medium text-zinc-300">Nenhum Tenant Encontrado</h3>
              <p className="text-zinc-500 mt-2 max-w-sm">
                Utilize a CLI <code>npm run cli tenant:create</code> ou clique em &quot;Novo Projeto&quot; para registrar sua primeira empresa.
              </p>
            </div>
          ) : (
            companies.map((company) => {
              const scheduler = company.schedulers[0];
              const isRunning = scheduler?.status === "RUNNING";

              return (
                <Link key={company.id} href={`/dashboard/${company.slug}`}>
                  <div className="group relative p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 transition-all duration-300 hover:border-indigo-500/50 hover:shadow-2xl hover:shadow-indigo-500/10 cursor-pointer overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    <div className="flex justify-between items-start mb-4">
                      <h2 className="text-xl font-semibold text-zinc-100 group-hover:text-indigo-400 transition-colors">
                        {company.name}
                      </h2>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isRunning ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                        {isRunning ? 'Ativo' : 'Parado'}
                      </div>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-3 text-sm text-zinc-400">
                        <div className="p-1.5 rounded-md bg-zinc-800 text-zinc-500">
                          <Activity className="w-4 h-4" />
                        </div>
                        <span className="truncate">{company.githubOwner} / {company.repoName}</span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-sm text-zinc-400">
                        <div className="p-1.5 rounded-md bg-zinc-800 text-zinc-500">
                          <CalendarDays className="w-4 h-4" />
                        </div>
                        <span>Criado em {company.createdAt.toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
                      Acessar Dashboard
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
