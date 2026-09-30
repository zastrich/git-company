"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Check, Trash2, Globe, HardDrive, KeyRound, AlertTriangle } from "lucide-react";

interface LlmProvider {
  slug: string;
  name: string;
  type: string;
  baseUrl: string | null;
  isLocal: boolean;
  agentsCount: number;
  secretKey: string | null;
  credentialConfigured: boolean;
}

function providerSecretKey(slug: string): string {
  return `PROVIDER_${slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

export function LlmManager() {
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // form
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [isLocal, setIsLocal] = useState(false);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const isCustom = type === "custom";
  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

  async function load() {
    setLoading(true);
    const res = await fetch("/api/llms");
    if (res.ok) {
      const data = await res.json();
      setProviders(data.providers ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/llms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, type, baseUrl: baseUrl || null, isLocal, token: token || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Erro ao salvar."); return; }
      setName(""); setSlug(""); setBaseUrl(""); setToken(""); setOpen(false);
      await load();
    } catch {
      setMsg("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: string) {
    if (!confirm(`Remover o provider "${s}"?`)) return;
    const res = await fetch(`/api/llms?slug=${encodeURIComponent(s)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? "Erro ao remover."); return; }
    await load();
  }

  // adicionar credencial a um provider existente
  const [credFor, setCredFor] = useState<string | null>(null);
  const [credValue, setCredValue] = useState("");
  const [credSaving, setCredSaving] = useState(false);

  async function saveCredential(p: LlmProvider) {
    if (!credValue) return;
    setCredSaving(true);
    try {
      const res = await fetch("/api/llms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: p.name, slug: p.slug, type: p.type, baseUrl: p.baseUrl, isLocal: p.isLocal, token: credValue }),
      });
      if (res.ok) { setCredFor(null); setCredValue(""); await load(); }
    } finally {
      setCredSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm"
        >
          <Plus className="w-4 h-4" /> Nova LLM
        </button>
      </div>

      {open && (
        <form onSubmit={handleSave} className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Nome</label>
              <input required value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-")); }} className={inputCls} placeholder="Ex: NVIDIA NIM" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Slug</label>
              <input required value={slug} onChange={(e) => setSlug(e.target.value)} className={`${inputCls} font-mono`} placeholder="nvidia" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              <option value="custom">Custom (OpenAI-compatible)</option>
              <option value="openai">OpenAI (ChatGPT)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Google Gemini</option>
              <option value="groq">Groq</option>
              <option value="bedrock">AWS Bedrock</option>
              <option value="moonshot">Moonshot (Kimi)</option>
              <option value="ollama">Ollama (Local)</option>
              <option value="kiro-cli">Kiro (CLI)</option>
              <option value="local">Local (Básico)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Base URL {isCustom ? "" : "(opcional)"}</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required={isCustom} className={`${inputCls} font-mono`} placeholder={isCustom ? "https://integrate.api.nvidia.com/v1" : "http://localhost:11434"} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Token / API Key</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" className={inputCls} placeholder="••••  (write-only, global)" />
            {slug && token && (
              <p className="text-[11px] text-zinc-500 mt-1.5 font-mono">Salvo como: {providerSecretKey(slug)}</p>
            )}
          </div>
          {msg && <p className="text-xs text-red-400">{msg}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : providers.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 text-center text-zinc-400">
          Nenhuma LLM configurada. Clique em &quot;Nova LLM&quot;.
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.slug} className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${p.isLocal ? "bg-emerald-500/10 text-emerald-400" : "bg-purple-500/10 text-purple-400"}`}>
                    {p.isLocal ? <HardDrive className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">{p.name}</h3>
                    <p className="text-xs text-zinc-500 font-mono">{p.slug} · {p.type}{p.baseUrl ? ` · ${p.baseUrl}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.credentialConfigured ? (
                    <span className="px-2.5 py-1 rounded-full text-xs border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> credencial ok
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs border bg-amber-500/10 text-amber-400 border-amber-500/20 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> sem credencial
                    </span>
                  )}
                  <button onClick={() => handleDelete(p.slug)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {p.secretKey && !p.credentialConfigured && (
                credFor === p.slug ? (
                  <div className="flex gap-2">
                    <input type="password" value={credValue} onChange={(e) => setCredValue(e.target.value)} autoComplete="new-password" className={inputCls} placeholder={`Valor de ${p.secretKey}`} />
                    <button onClick={() => saveCredential(p)} disabled={credSaving || !credValue} className="inline-flex items-center gap-1.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50">
                      {credSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setCredFor(p.slug); setCredValue(""); }} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300">
                    <KeyRound className="w-4 h-4" /> Configurar credencial
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
