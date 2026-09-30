import { KanbanBoard } from "./kanban-board";

export default async function KanbanPage(props: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await props.params;
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Kanban</h1>
        <p className="text-zinc-400 mt-2">
          O mesmo board do GitHub Projects: etapas, cards (issues) e o agente responsável por cada um (label <code>agent::ID</code>).
        </p>
      </div>
      <KanbanBoard companySlug={companySlug} />
    </div>
  );
}
