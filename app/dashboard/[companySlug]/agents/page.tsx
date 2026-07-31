import { prisma } from "../../../../lib/db/client";
import { notFound } from "next/navigation";
import { Octokit } from "octokit";
import { BusinessConfig } from "../../../../lib/baac/types";
import { Bot, BrainCircuit, RefreshCw } from "lucide-react";

export default async function AgentsPage(props: {
  params: Promise<{ companySlug: string }>;
}) {
  const params = await props.params;
  const company = await prisma.company.findUnique({
    where: { slug: params.companySlug },
  });

  if (!company) notFound();

  let businessConfig: BusinessConfig | null = null;
  let errorMsg = null;

  try {
    const octokit = new Octokit({ auth: company.githubToken });
    const { data } = await octokit.rest.repos.getContent({
      owner: company.githubOwner,
      repo: company.repoName,
      path: "business.json",
    });

    if (!Array.isArray(data) && data.type === "file") {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      businessConfig = JSON.parse(content) as BusinessConfig;
    }
  } catch (error: any) {
    console.error("Erro ao carregar business.json:", error);
    errorMsg = "Não foi possível carregar o arquivo business.json do repositório.";
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Agentes da Empresa</h1>
          <p className="text-zinc-400 mt-2">
            Organograma e especialistas configurados no <code>business.json</code>.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
          {errorMsg}
        </div>
      )}

      {businessConfig && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {businessConfig.agents?.map((agent) => (
            <div key={agent.agentId} className="flex flex-col p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/50 transition-colors">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{agent.role}</h3>
                  <p className="text-xs text-zinc-500 font-mono">{agent.agentId}</p>
                </div>
              </div>

              <div className="flex-1 space-y-4 mb-6">
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Modelo LLM</p>
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-purple-400" />
                    <span className="text-sm text-zinc-300 font-medium capitalize">{agent.llm.provider}</span>
                    <span className="text-xs text-zinc-500">({agent.llm.model})</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Labels Assinadas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.labels.map(label => (
                      <span key={label} className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Tick Interval</p>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-zinc-300">{agent.tickIntervalSeconds ?? 60} segundos</span>
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
