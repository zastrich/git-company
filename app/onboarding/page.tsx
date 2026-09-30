import { prisma } from "../../lib/db/client";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Server } from "lucide-react";
import { OnboardingWizard } from "./wizard";
import { providerSecretKey } from "../../lib/db/secrets";
import { getSystemCompanyId } from "../../lib/db/system-tenant";

const FIXED_KEY_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  bedrock: "AWS_BEDROCK_KEY",
  moonshot: "MOONSHOT_API_KEY",
  groq: "GROQ_API_KEY",
};

function keyForProvider(type: string, slug: string): string {
  if (type === "custom" || type === "kiro-cli") return providerSecretKey(slug);
  if (type === "ollama" || type === "local") return "";
  return FIXED_KEY_MAP[type] ?? "";
}

// Lê o banco em tempo de requisição — não pré-renderizar no build.
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const all = await prisma.aIProvider.findMany({ orderBy: { name: "asc" } });
  const systemId = await getSystemCompanyId();
  const secrets = await prisma.companySecret.findMany({
    where: { companyId: systemId },
    select: { key: true },
  });
  const haveKeys = new Set(secrets.map((s) => s.key));

  // Uma LLM é "utilizável" se não precisa de credencial (local/ollama) ou já tem a credencial global.
  const usable = all.filter((p) => {
    const key = keyForProvider(p.type, p.slug);
    return key === "" || haveKeys.has(key);
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-8">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Novo Projeto do Zero</h1>
          <p className="text-zinc-400 mt-2">
            Escolha uma LLM assistente, descreva o projeto e deixe a IA propor o fluxo de trabalho,
            etapas, etiquetas e os agentes/colaboradores. Você revisa antes de criar.
          </p>
        </header>

        {usable.length === 0 ? (
          <div className="p-6 rounded-2xl border border-amber-500/30 bg-amber-950/10 space-y-3">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-lg font-semibold text-white">Nenhuma LLM disponível</h2>
            </div>
            <p className="text-sm text-zinc-300">
              É preciso configurar ao menos uma LLM (com credencial) antes de iniciar um projeto assistido por IA.
            </p>
            <Link
              href="/providers"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm"
            >
              <Server className="w-4 h-4" /> Configurar LLMs
            </Link>
          </div>
        ) : (
          <OnboardingWizard
            providers={usable.map((p) => ({
              slug: p.slug,
              name: p.name,
              type: p.type,
              baseUrl: p.baseUrl,
            }))}
          />
        )}
      </div>
    </div>
  );
}
