"use client";

import { useState } from "react";
import { Plus, Server, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

/** Deriva a chave de secret a partir do slug do provider (espelha lib/db/secrets.ts). */
function providerSecretKey(providerSlug: string): string {
  return `PROVIDER_${providerSlug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

export function ProviderForm({ companySlug }: { companySlug: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [isLocal, setIsLocal] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  const isCustom = type === "custom";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, type, baseUrl: baseUrl || null, isLocal }),
      });

      if (!res.ok) {
        const err = await res.json();
        setMsg(err.error || "Erro ao cadastrar provider.");
        return;
      }

      // Se um token foi informado, grava como secret write-only (nunca lido de volta).
      if (token.trim()) {
        const secretKey = providerSecretKey(slug);
        const secRes = await fetch(`/api/secrets/${companySlug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: secretKey, value: token.trim() }),
        });
        if (!secRes.ok) {
          const err = await secRes.json();
          setMsg(`Provider salvo, mas falha ao gravar credencial: ${err.error ?? ""}`);
          setToken("");
          router.refresh();
          return;
        }
      }

      setMsg("Provider cadastrado com sucesso!");
      setName("");
      setSlug("");
      setBaseUrl("");
      setToken("");
      setOpen(false);
      router.refresh();
    } catch {
      setMsg("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/20"
      >
        <Plus className="w-4 h-4" />
        Novo Provider
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Server className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-white">Cadastrar Provider de IA</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Nome (ex: Google Gemini)
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Google Gemini"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Slug (ex: gemini)
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                  placeholder="gemini"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Tipo de Integração
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="openai">OpenAI (ChatGPT)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="bedrock">AWS Bedrock</option>
                  <option value="moonshot">Kimi K3 (Moonshot)</option>
                  <option value="ollama">Ollama (Local CLI)</option>
                  <option value="groq">Groq</option>
                  <option value="custom">Custom (API OpenAI-compatible)</option>
                  <option value="local">Local (Organizador Básico, sem rede)</option>
                </select>
                {isCustom && (
                  <p className="text-xs text-zinc-500 mt-1.5">
                    Genérico: informe a Base URL do endpoint (ex: NVIDIA NIM
                    <code className="mx-1">https://integrate.api.nvidia.com/v1</code>) e o token abaixo.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Base URL Customizada (Opcional)
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required={isCustom}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                  placeholder={isCustom ? "https://integrate.api.nvidia.com/v1" : "http://localhost:11434"}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Token / API Key {isCustom ? "" : "(Opcional)"}
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="••••  (gravado como segredo write-only)"
                />
                {slug && token && (
                  <p className="text-[11px] text-zinc-500 mt-1.5 font-mono">
                    Será salvo como: PROVIDER_{slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isLocal"
                  checked={isLocal}
                  onChange={(e) => setIsLocal(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600"
                />
                <label htmlFor="isLocal" className="text-sm text-zinc-300">
                  Provider Executado Localmente (ex: Ollama)
                </label>
              </div>

              {msg && <p className="text-xs text-indigo-400 font-medium">{msg}</p>}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-sm transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
