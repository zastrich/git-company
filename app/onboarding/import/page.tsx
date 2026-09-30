import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ImportWizard } from "./import-wizard";

export default function ImportPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Importar Repositório Existente</h1>
          <p className="text-zinc-400 mt-2">
            Aponte para um repositório que já contém o <code>business.json</code>. A aplicação lê a
            configuração, cria o projeto localmente, garante os providers necessários e informa quais
            credenciais faltam nesta máquina. Isso permite várias máquinas trabalharem no mesmo projeto.
          </p>
        </header>

        <ImportWizard />
      </div>
    </div>
  );
}
