import { prisma } from "../../../../lib/db/client";
import { notFound } from "next/navigation";
import { TerminalSquare, ShieldAlert, CheckCircle2, Info } from "lucide-react";

export default async function LogsPage(props: {
  params: Promise<{ companySlug: string }>;
}) {
  const params = await props.params;
  const company = await prisma.company.findUnique({
    where: { slug: params.companySlug },
  });

  if (!company) notFound();

  const logs = await prisma.auditLog.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Log de Auditoria</h1>
        <p className="text-zinc-400 mt-2">
          Histórico das últimas 100 ações executadas pelos agentes e pelo sistema.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
              <tr>
                <th className="px-6 py-4 font-medium">Horário</th>
                <th className="px-6 py-4 font-medium">Agente</th>
                <th className="px-6 py-4 font-medium">Ação</th>
                <th className="px-6 py-4 font-medium w-1/2">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                    <TerminalSquare className="w-8 h-8 mx-auto mb-3 text-zinc-700" />
                    Nenhum log registrado
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  let parsedDetails;
                  try { parsedDetails = JSON.parse(log.details); } catch { parsedDetails = log.details; }
                  
                  const isError = log.action.includes('ERROR') || log.action.includes('FAILED');
                  
                  return (
                    <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-zinc-500">
                        {log.createdAt.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 font-medium text-xs">
                          {log.agentName}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isError ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                          {isError ? <ShieldAlert className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-zinc-400 max-w-sm truncate" title={log.details}>
                        {typeof parsedDetails === 'object' ? JSON.stringify(parsedDetails) : parsedDetails}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
