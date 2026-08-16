import { prisma } from "../../../../lib/db/client";
import { notFound } from "next/navigation";
import { Bot, BrainCircuit, RefreshCw, Crown } from "lucide-react";
import { AgentPauseButton } from "./agent-pause-button";

export default async function AgentsPage(props: {
  params: Promise<{ companySlug: string }>;
}) {
  const params = await props.params;
  const company = await prisma.company.findUnique({
    where: { slug: params.companySlug },
    include: {
      agents: {
        include: { provider: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!company) notFound();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Agentes da Empresa</h1>
          <p className="text-zinc-400 mt-2">
            Organograma e especialistas cadastrados para a empresa <span className="font-semibold text-indigo-400">{company.name}</span>.
          </p>
        </div>
      </div>

      {company.agents.length === 0 ? (
        <div className="p-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 text-center">
          <Bot className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-zinc-300">Nenhum agente cadastrado no banco</h3>
          <p className="text-sm text-zinc-500 mt-1">
            Utilize a CLI <code>bun run cli company:create</code> ou <code>agent:add</code> para cadastrar agentes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {company.agents.map((agent) => (
            <div
              key={agent.id}
              className={`flex flex-col p-6 rounded-2xl border transition-all ${
                agent.isPaused
                  ? "border-amber-500/20 bg-amber-950/10 opacity-80"
                  : "border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${agent.isCeo ? "bg-amber-500/10 text-amber-400" : "bg-indigo-500/10 text-indigo-400"}`}>
                    {agent.isCeo ? <Crown className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-1.5">
                      {agent.role}
                      {agent.isCeo && <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">CEO</span>}
                    </h3>
                    <p className="text-xs text-zinc-500 font-mono">{agent.agentId}</p>
                  </div>
                </div>

                <AgentPauseButton
                  agentId={agent.id}
                  companySlug={company.slug}
                  initialIsPaused={agent.isPaused}
                />
              </div>

              <div className="flex-1 space-y-4 mb-6">
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Modelo LLM & Provider</p>
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-zinc-300 font-medium capitalize">
                      {agent.provider?.name ?? "Human / Custom"}
                    </span>
                    {agent.model && <span className="text-xs text-zinc-500">({agent.model})</span>}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Labels Assinadas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.labels ? (
                      agent.labels.split(",").map((label) => (
                        <span key={label} className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-mono">
                          {label.trim()}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Tick Interval</p>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-zinc-300">{agent.tickIntervalSeconds}s ({Math.round(agent.tickIntervalSeconds / 60)} min)</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800/50">
                <p className="text-xs text-zinc-400 line-clamp-2" title={agent.context}>
                  <span className="font-semibold text-zinc-300">Escopo:</span> {agent.context}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
