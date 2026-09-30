import Link from "next/link";
import { ArrowLeft, Server } from "lucide-react";
import { LlmManager } from "./llm-manager";

export default function GlobalProvidersPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">LLMs Disponíveis</h1>
            <p className="text-zinc-400 mt-1">
              Configure aqui os provedores de IA e suas credenciais. Isto é pré-requisito para criar
              ou importar projetos assistidos por IA.
            </p>
          </div>
        </header>

        <LlmManager />
      </div>
    </div>
  );
}
