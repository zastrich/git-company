import { prisma } from "../../../../lib/db/client";
import { notFound } from "next/navigation";
import { Settings, GitBranch, ShieldCheck, Target, RefreshCw, Database } from "lucide-react";
import { SyncButton } from "./sync-button";

export default async function SettingsPage(props: {
  params: Promise<{ companySlug: string }>;
}) {
  const params = await props.params;
  const company = await prisma.company.findUnique({
    where: { slug: params.companySlug },
    include: {
      secrets: { select: { key: true } },
      configs: true,
      _count: { select: { agents: true, repos: true, logs: true } },
    },
  });

  if (!company) notFound();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Configurações da Empresa</h1>
        <p className="text-zinc-400 mt-2">
          Parâmetros do tenant <span className="font-semibold text-indigo-400">{company.name}</span> e sincronização de organograma.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Painel Principal de Informações */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-5">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Settings className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Identificação da Empresa</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Nome da Empresa</p>
                <p className="text-sm font-medium text-white">{company.name}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Slug (Tenant ID)</p>
                <p className="text-sm font-mono text-indigo-400">{company.slug}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Prefixo de Repositório</p>
                <p className="text-sm font-mono text-zinc-300">{company.repoPrefix || "Nenhum prefixo"}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Repositório de Organograma</p>
                <p className="text-sm font-mono text-zinc-300">{company.githubOwner}/{company.repoName}</p>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Missão Institucional</p>
              <div className="p-3.5 rounded-xl bg-zinc-800/40 border border-zinc-700/50 text-sm text-zinc-300">
                {company.mission || "Nenhuma missão declarada."}
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Segredos & Credenciais</h3>
            </div>

            <p className="text-xs text-zinc-400">
              Todas as chaves de API estão armazenadas de forma segura na tabela <code>CompanySecret</code> e nunca expostas na interface.
            </p>

            <div className="flex flex-wrap gap-2">
              {company.secrets.map((s) => (
                <span key={s.key} className="px-3 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {s.key}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Painel de Sincronização */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-indigo-500/30 bg-indigo-950/10 space-y-5">
            <div className="flex items-center gap-3 border-b border-indigo-500/20 pb-4">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Org Sync Bidirecional</h3>
                <p className="text-xs text-zinc-400">Sincronize local DB com business.json no GitHub</p>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              <div>
                <p className="text-xs text-zinc-400 mb-2">
                  Envia o estado atual do banco SQLite local para o repositório <code>{company.repoName}</code>.
                </p>
                <SyncButton companySlug={company.slug} direction="push" />
              </div>

              <div className="pt-3 border-t border-zinc-800">
                <p className="text-xs text-zinc-400 mb-2">
                  Baixa o <code>business.json</code> do GitHub e atualiza a configuração de agentes no banco local.
                </p>
                <SyncButton companySlug={company.slug} direction="pull" />
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>Resumo do Banco Local</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-2">
              <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
                <p className="text-xl font-bold text-white">{company._count.agents}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Agentes</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
                <p className="text-xl font-bold text-white">{company._count.repos}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Repos</p>
              </div>
              <div className="p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/50">
                <p className="text-xl font-bold text-white">{company._count.logs}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Logs</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
