import { prisma } from "../../../../lib/db/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Bot, MessageSquare, ChevronRight } from "lucide-react";

export default async function ChatIndexPage(props: {
  params: Promise<{ companySlug: string }>;
}) {
  const params = await props.params;
  const company = await prisma.company.findUnique({
    where: { slug: params.companySlug },
  });

  if (!company) notFound();

  const agents = await prisma.agentConfig.findMany({
    where: { companyId: company.id },
    include: { provider: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Chat com Agentes</h1>
        <p className="text-zinc-400 mt-2">
          Selecione um agente para iniciar uma conversa. Defina a janela de contexto dentro do chat.
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 text-center">
          <Bot className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400">Nenhum agente configurado. Use a CLI para adicionar agentes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/dashboard/${params.companySlug}/chat/${agent.agentId}`}
            >
              <div className="group p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/60 hover:border-indigo-500/40 transition-all cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">
                        {agent.role}
                      </h3>
                      <p className="text-xs text-zinc-500">{agent.agentId} &middot; {agent.provider.name}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />
                </div>
                <p className="text-sm text-zinc-400 mt-3 line-clamp-2">{agent.context}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
