"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, KeyRound, RefreshCw } from "lucide-react";

interface GithubStatus {
  configured: boolean;
  valid: boolean;
  login: string;
  currentScopes: string[];
  missingRequired: string[];
  missingRecommended: string[];
  message: string;
}

export function DiagnosticsPanel() {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

  async function load() {
    setLoading(true);
    const res = await fetch("/api/diagnostics");
    if (res.ok) {
      const data = await res.json();
      setStatus(data.github);
      if (!data.github.configured || !data.github.valid) setShowForm(true);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(data.github);
        setToken("");
        if (data.github.valid) setShowForm(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</div>;
  }

  const ok = status?.configured && status?.valid && (status?.missingRequired.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className={`p-6 rounded-2xl border ${ok ? "border-emerald-500/30 bg-emerald-950/10" : "border-amber-500/30 bg-amber-950/10"}`}>
        <div className="flex items-center gap-3 mb-4">
          {ok ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : status?.configured ? <AlertTriangle className="w-6 h-6 text-amber-400" /> : <XCircle className="w-6 h-6 text-red-400" />}
          <div>
            <h2 className="text-lg font-semibold text-white">Token GitHub Global</h2>
            <p className="text-xs text-zinc-400">
              {ok ? `Conectado como @${status?.login}` : status?.configured ? "Configurado, mas com pendências" : "Não configurado"}
            </p>
          </div>
          <button onClick={load} className="ml-auto p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800" title="Revalidar">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {status?.configured && (
          <div className="space-y-2 text-sm">
            <ScopeRow label="Token válido" ok={status.valid} />
            {REQUIRED.map((s) => (
              <ScopeRow key={s} label={`scope: ${s}`} ok={!status.missingRequired.includes(s)} />
            ))}
            {RECOMMENDED.map((s) => (
              <ScopeRow key={s} label={`scope: ${s} (recomendado)`} ok={!status.missingRecommended.includes(s)} warn />
            ))}
          </div>
        )}

        {!showForm && (
          <button onClick={() => setShowForm(true)} className="mt-4 inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
            <KeyRound className="w-4 h-4" /> {status?.configured ? "Substituir token" : "Configurar token"}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={save} className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Token GitHub (write-only)</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} required autoComplete="new-password" className={inputCls} placeholder="ghp_… ou gho_…" />
            <p className="text-[11px] text-zinc-500 mt-1.5">Scopes necessários: repo, project, read:org. Recomendado: workflow.</p>
          </div>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Validar e salvar
          </button>
        </form>
      )}
    </div>
  );
}

const REQUIRED = ["repo", "project", "read:org"];
const RECOMMENDED = ["workflow"];

function ScopeRow({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      ) : warn ? (
        <AlertTriangle className="w-4 h-4 text-amber-400" />
      ) : (
        <XCircle className="w-4 h-4 text-red-400" />
      )}
      <span className={ok ? "text-zinc-300" : warn ? "text-amber-300" : "text-red-300"}>{label}</span>
    </div>
  );
}
