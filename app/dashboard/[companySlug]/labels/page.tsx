import { LabelsManager } from "./labels-manager";

export default async function LabelsPage(props: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await props.params;
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Etiquetas</h1>
        <p className="text-zinc-400 mt-2">
          As etiquetas vivem no GitHub (fonte da verdade). Crie, edite e remova aqui — as mudanças vão direto para o repositório.
        </p>
      </div>
      <LabelsManager companySlug={companySlug} />
    </div>
  );
}
