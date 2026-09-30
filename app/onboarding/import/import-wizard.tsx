"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Loader2, Check, KeyRound, AlertTriangle, ArrowRight } from "lucide-react";

interface MissingSecret { key: string; providerType: string; reason: string }
interface UnresolvedProvider { agentIds: string[]; referenced: string; providerType: string; reason: string }
interface AvailableProvider { slug: string; name: string; type: string }
interface ImportResult {
  companyId: string; slug: string; name: string;
  agentsImported: number; providersEnsured: string[];
  missingSecrets: MissingSecret[];
  unresolvedProviders: UnresolvedProvider[];
  availableProviders: AvailableProvider[];
  reused: boolean;
}

export function ImportWizard() {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  // preenchimento de secrets faltantes após import
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState("");

  // remapeamento de LLMs indisponíveis
  const [remapChoice, setRemapChoice] = useState<Record<string, string>>({});
  const [remapping, setRemapping] = useState("");

  async function applyRemap(u: UnresolvedProvider) {
    if (!result) return;
    const providerSlug = remapChoice[u.referenced];
    if (!providerSlug) return;
    setRemapping(u.referenced);
    try {
      // aplica o provider escolhido a cada agente afetado
      for (const agentId of u.agentIds) {
        await fetch(`/api/company/${result.slug}/agents`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, providerSlug, type: "ai" }),
        });
      }
      setResult({
        ...result,
        unresolvedProviders: result.unresolvedProviders.filter((x) => x.referenced !== u.referenced),
      });
    } finally {
      setRemapping("");
    }
  }

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/onboarding/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, token }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Erro ao importar."); return; }
      setResult(data);
    } catch {
      setMsg("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSecret(key: string) {
    if (!result) return;
    const value = secretValues[key];
    if (!value) return;
    setSavingKey(key);
    try {
      const res = await fetch(`/api/secrets/${result.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (res.ok) {
        setResult({
          ...result,
          missingSecrets: result.missingSecrets.filter((s) => s.key !== key),
        });
      }
    } finally {
      setSavingKey("");
    }
  }

  // ── Resultado do import ──────────────────────────────
  if (result) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-2xl border border-emerald-500/30 bg-emerald-950/10 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400">
            <Check className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-white">
              {result.reused ? "Projeto atualizado" : "Projeto importado"}: {result.name}
            </h2>
          </div>
          <p className="text-sm text-zinc-300">
            {result.agentsImported} agente(s) importado(s).{" "}
            {result.providersEnsured.length > 0
              ? `Providers criados: ${result.providersEnsured.join(", ")}.`
              : "Todos os providers já existiam."}
          </p>
        </div>

        {result.unresolvedProviders.length > 0 && (
          <div className="p-6 rounded-2xl border border-red-500/30 bg-red-950/10 space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-lg font-semibold text-white">LLMs indisponíveis — troque por uma disponível</h2>
            </div>
            <p className="text-xs text-zinc-400">
              Alguns agentes referenciam uma LLM que não está configurada nesta máquina. Escolha uma LLM
              disponível para cada caso; ela será aplicada aos agentes afetados.
            </p>
            <div className="space-y-3">
              {result.unresolvedProviders.map((u) => (
                <div key={u.referenced} className="p-4 rounded-xl bg-zinc-800/40 border border-zinc-700/50 space-y-2">
                  <p className="text-sm text-zinc-200">
                    <span className="font-mono text-red-300">{u.referenced}</span>{" "}
                    <span className="text-xs text-zinc-500">({u.providerType})</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    Agentes afetados: {u.agentIds.join(", ")}
                  </p>
                  <div className="flex gap-2">
                    <select
                      value={remapChoice[u.referenced] ?? ""}
                      onChange={(e) => setRemapChoice((v) => ({ ...v, [u.referenced]: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Escolha uma LLM disponível…</option>
                      {result.availableProviders.map((p) => (
                        <option key={p.slug} value={p.slug}>{p.name} ({p.type})</option>
                      ))}
                    </select>
                    <button
                      onClick={() => applyRemap(u)}
                      disabled={remapping === u.referenced || !remapChoice[u.referenced]}
                      className="inline-flex items-center gap-1.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {remapping === u.referenced ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Aplicar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.missingSecrets.length > 0 ? (
          <div className="p-6 rounded-2xl border border-amber-500/30 bg-amber-950/10 space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-lg font-semibold text-white">Credenciais faltando nesta máquina</h2>
            </div>
            <p className="text-xs text-zinc-400">
              Estas chaves são necessárias para os agentes rodarem aqui. Os valores ficam só nesta
              máquina (write-only) — nunca vêm do repositório remoto.
            </p>
            <div className="space-y-3">
              {result.missingSecrets.map((s) => (
                <div key={s.key} className="p-4 rounded-xl bg-zinc-800/40 border border-zinc-700/50 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    <span className="font-mono text-zinc-200">{s.key}</span>
                    <span className="text-xs text-zinc-500">({s.providerType})</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={secretValues[s.key] ?? ""}
                      onChange={(e) => setSecretValues((v) => ({ ...v, [s.key]: e.target.value }))}
                      autoComplete="new-password"
                      className={inputCls}
                      placeholder="Valor da credencial (••••)"
                    />
                    <button
                      onClick={() => saveSecret(s.key)}
                      disabled={savingKey === s.key || !secretValues[s.key]}
                      className="inline-flex items-center gap-1.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {savingKey === s.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Salvar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 text-sm text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4" /> Todas as credenciais necessárias já estão configuradas nesta máquina.
          </div>
        )}

        <Link
          href={`/dashboard/${result.slug}`}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
        >
          Abrir dashboard <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  // ── Formulário de import ─────────────────────────────
  return (
    <form onSubmit={handleImport} className="space-y-6">
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Owner</label>
            <input required value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} placeholder="usuário ou organização" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Repositório</label>
            <input required value={repo} onChange={(e) => setRepo(e.target.value)} className={`${inputCls} font-mono`} placeholder="ex: comp-org" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Token GitHub</label>
          <input required type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" className={inputCls} placeholder="token com acesso ao repositório (••••)" />
          <p className="text-[11px] text-zinc-500 mt-1.5">Guardado localmente para esta máquina acessar o repositório.</p>
        </div>
      </div>

      {msg && <p className="text-sm text-red-400">{msg}</p>}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-60"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
        Importar projeto
      </button>
    </form>
  );
}
