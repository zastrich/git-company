import { prisma } from "../../../../lib/db/client";
import { notFound } from "next/navigation";
import { Server, Cpu, Globe, HardDrive } from "lucide-react";
import { ProviderForm } from "./provider-form";

export default async function ProvidersPage(props: {
  params: Promise<{ companySlug: string }>;
}) {
  const params = await props.params;
  const company = await prisma.company.findUnique({
    where: { slug: params.companySlug },
  });

  if (!company) notFound();

  const providers = await prisma.aIProvider.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { agents: true } } },
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Catálogo de AI Providers</h1>
          <p className="text-zinc-400 mt-2">
            Provedores de Inteligência Artificial registrados e disponíveis para vinculação aos agentes.
          </p>
        </div>

        <ProviderForm />
      </div>

      {providers.length === 0 ? (
        <div className="p-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 text-center">
          <Server className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-zinc-300">Nenhum provider cadastrado no catálogo</h3>
          <p className="text-sm text-zinc-500 mt-1">
            Clique em &quot;Novo Provider&quot; ou utilize a CLI <code>bun run cli provider:add</code>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map((p) => (
            <div
              key={p.id}
              className="flex flex-col p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 transition-all"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${p.isLocal ? "bg-emerald-500/10 text-emerald-400" : "bg-purple-500/10 text-purple-400"}`}>
                    {p.isLocal ? <HardDrive className="w-6 h-6" /> : <Globe className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                    <p className="text-xs text-zinc-500 font-mono">{p.slug}</p>
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  p.isLocal
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                }`}>
                  {p.isLocal ? "Local" : "Cloud API"}
                </span>
              </div>

              <div className="flex-1 space-y-3 mb-4">
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Tipo LangChain</p>
                  <p className="text-sm text-zinc-300 font-mono bg-zinc-800/60 px-3 py-1.5 rounded-lg border border-zinc-700/50 inline-block">
                    {p.type}
                  </p>
                </div>

                {p.baseUrl && (
                  <div>
                    <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Base URL</p>
                    <p className="text-xs text-zinc-400 font-mono truncate" title={p.baseUrl}>
                      {p.baseUrl}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-zinc-800/50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>{p._count.agents} agente(s) vinculado(s)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
