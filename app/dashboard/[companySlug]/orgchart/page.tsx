import { prisma } from "../../../../lib/db/client";
import { notFound } from "next/navigation";
import { Crown, Bot, User, CornerDownRight } from "lucide-react";

interface Node {
  agentId: string;
  role: string;
  type: string;
  isCeo: boolean;
  providerName: string | null;
  children: Node[];
}

export default async function OrgChartPage(props: {
  params: Promise<{ companySlug: string }>;
}) {
  const params = await props.params;
  const company = await prisma.company.findUnique({
    where: { slug: params.companySlug },
    include: { agents: { include: { provider: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!company) notFound();

  const agents = company.agents;
  const byId = new Map(agents.map((a) => [a.agentId, a]));

  // monta filhos a partir do campo subordinates (csv de agentIds)
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const a of agents) {
    const subs = a.subordinates.split(",").map((s) => s.trim()).filter((s) => s && byId.has(s));
    childrenOf.set(a.agentId, subs);
    subs.forEach((s) => hasParent.add(s));
  }

  function build(agentId: string, seen: Set<string>): Node {
    const a = byId.get(agentId)!;
    seen.add(agentId);
    const children = (childrenOf.get(agentId) ?? [])
      .filter((c) => !seen.has(c))
      .map((c) => build(c, seen));
    return {
      agentId: a.agentId,
      role: a.role,
      type: a.type,
      isCeo: a.isCeo,
      providerName: a.provider?.name ?? null,
      children,
    };
  }

  // raízes: CEO(s) primeiro, depois agentes sem pai
  const seen = new Set<string>();
  const roots: Node[] = [];
  for (const a of agents) {
    if (a.isCeo && !seen.has(a.agentId)) roots.push(build(a.agentId, seen));
  }
  for (const a of agents) {
    if (!hasParent.has(a.agentId) && !seen.has(a.agentId)) roots.push(build(a.agentId, seen));
  }
  // agentes órfãos restantes (ciclos ou desconectados)
  for (const a of agents) {
    if (!seen.has(a.agentId)) roots.push(build(a.agentId, seen));
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Organograma</h1>
        <p className="text-zinc-400 mt-2">
          Hierarquia de subordinação de <span className="font-semibold text-indigo-400">{company.name}</span>.
          Defina os subordinados de cada agente na aba Agentes.
        </p>
      </div>

      {agents.length === 0 ? (
        <div className="p-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 text-center text-zinc-400">
          Nenhum agente cadastrado ainda.
        </div>
      ) : (
        <div className="space-y-4">
          {roots.map((r) => (
            <TreeNode key={r.agentId} node={r} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNode({ node, depth }: { node: Node; depth: number }) {
  const isHuman = node.type === "human";
  return (
    <div className={depth > 0 ? "ml-6 border-l border-zinc-800 pl-6 relative" : ""}>
      {depth > 0 && (
        <CornerDownRight className="w-4 h-4 text-zinc-600 absolute -left-[9px] top-4" />
      )}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${node.isCeo ? "border-amber-500/30 bg-amber-950/10" : "border-zinc-800 bg-zinc-900/50"}`}>
        <div className={`p-2.5 rounded-xl ${node.isCeo ? "bg-amber-500/10 text-amber-400" : isHuman ? "bg-sky-500/10 text-sky-400" : "bg-indigo-500/10 text-indigo-400"}`}>
          {node.isCeo ? <Crown className="w-5 h-5" /> : isHuman ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">{node.role}</h3>
            {node.isCeo && <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">CEO</span>}
            <span className={`text-[10px] px-2 py-0.5 rounded border ${isHuman ? "bg-sky-500/10 text-sky-300 border-sky-500/30" : "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"}`}>
              {isHuman ? "Humano" : "IA"}
            </span>
          </div>
          <p className="text-xs text-zinc-500 font-mono">
            {node.agentId}{node.providerName ? ` · ${node.providerName}` : ""}
          </p>
        </div>
      </div>

      {node.children.length > 0 && (
        <div className="mt-3 space-y-3">
          {node.children.map((c) => (
            <TreeNode key={c.agentId} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
