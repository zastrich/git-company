import { prisma } from "../../../lib/db/client";
import { notFound } from "next/navigation";
import { Activity, Database, KeySquare, Cpu } from "lucide-react";

export default async function DashboardOverview(props: {
  params: Promise<{ companySlug: string }>;
}) {
  const params = await props.params;
  const company = await prisma.company.findUnique({
    where: { slug: params.companySlug },
    include: {
      schedulers: { orderBy: { updatedAt: "desc" }, take: 1 },
      secrets: true,
      logs: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!company) notFound();

  const scheduler = company.schedulers[0];
  const isRunning = scheduler?.status === "RUNNING";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Overview</h1>
        <p className="text-zinc-400 mt-2">Visão geral da operação da sua GitCompany.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-xl ${isRunning ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Scheduler Status</p>
              <h3 className={`text-2xl font-bold ${isRunning ? 'text-emerald-400' : 'text-red-400'}`}>
                {isRunning ? 'RUNNING' : 'STOPPED'}
              </h3>
            </div>
          </div>
        </div>

        {/* PID */}
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Process ID</p>
              <h3 className="text-2xl font-bold text-white">
                {scheduler?.pid ?? '--'}
              </h3>
            </div>
          </div>
        </div>

        {/* Secrets */}
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
              <KeySquare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Secrets Configurados</p>
              <h3 className="text-2xl font-bold text-white">
                {company.secrets.length}
              </h3>
            </div>
          </div>
        </div>

        {/* Logs */}
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400">Eventos Recentes</p>
              <h3 className="text-2xl font-bold text-white">
                {company.logs.length}
              </h3>
            </div>
          </div>
        </div>
      </div>

      {/* Recents */}
      <div className="mt-8 p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <h2 className="text-lg font-semibold text-white mb-6">Últimos Eventos</h2>
        {company.logs.length === 0 ? (
          <p className="text-zinc-500">Nenhum evento registrado ainda.</p>
        ) : (
          <div className="space-y-4">
            {company.logs.map((log) => (
              <div key={log.id} className="flex items-start gap-4 p-4 rounded-xl bg-zinc-950/50 border border-zinc-800/50">
                <div className="p-2 rounded-lg bg-zinc-800/50 text-zinc-400 mt-1">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-indigo-400">{log.action}</span>
                    <span className="text-xs text-zinc-500">
                      {log.createdAt.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">
                    <span className="font-semibold text-zinc-100">{log.agentName}</span> executou a ação.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
