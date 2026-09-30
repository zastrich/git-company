import Link from "next/link";
import { ArrowLeft, Stethoscope } from "lucide-react";
import { DiagnosticsPanel } from "./diagnostics-panel";

export default function DiagnosticsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Diagnóstico</h1>
            <p className="text-zinc-400 mt-1">
              Verifica se o token GitHub global está configurado corretamente para o uso da aplicação e da CLI.
            </p>
          </div>
        </header>

        <DiagnosticsPanel />
      </div>
    </div>
  );
}
