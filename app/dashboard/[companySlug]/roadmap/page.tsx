import { RoadmapManager } from "./roadmap-manager";

export default async function RoadmapPage(props: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await props.params;
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Roadmap &amp; Milestones</h1>
        <p className="text-zinc-400 mt-2">
          Milestones do repositório no GitHub, em ordem de entrega. Crie novos itens diretamente aqui.
        </p>
      </div>
      <RoadmapManager companySlug={companySlug} />
    </div>
  );
}
