"use client";

import { useState } from "react";
import { KeyRound, Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

interface SecretMeta {
  key: string;
  isSet: boolean;
  length: number;
}

export function SecretsManager({
  companySlug,
  initialSecrets,
}: {
  companySlug: string;
  initialSecrets: SecretMeta[];
}) {
  const [secrets, setSecrets] = useState<SecretMeta[]>(initialSecrets);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function refresh() {
    const res = await fetch(`/api/secrets/${companySlug}`);
    if (res.ok) {
      const data = await res.json();
      setSecrets(data.secrets ?? []);
    }
    router.refresh();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/secrets/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim().toUpperCase(), value }),
      });
      if (res.ok) {
        setMsg(`Credencial "${key.trim().toUpperCase()}" salva.`);
        setKey("");
        setValue("");
        await refresh();
      } else {
        const err = await res.json();
        setMsg(err.error ?? "Erro ao salvar.");
      }
    } catch {
      setMsg("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(k: string) {
    if (!confirm(`Remover a credencial "${k}"? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/secrets/${companySlug}?key=${encodeURIComponent(k)}`, {
      method: "DELETE",
    });
    if (res.ok) await refresh();
  }

  return (
    <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-5">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Segredos &amp; Credenciais</h3>
          <p className="text-xs text-zinc-400">
            Write-only: valores nunca são exibidos, apenas gravados ou substituídos.
          </p>
        </div>
      </div>

      {/* Lista de secrets existentes */}
      {secrets.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhuma credencial cadastrada ainda.</p>
      ) : (
        <div className="space-y-2">
          {secrets.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-800/40 border border-zinc-700/50"
            >
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-mono text-zinc-200">{s.key}</span>
                <span className="text-xs text-zinc-500">•••• configurado ({s.length} chars)</span>
              </div>
              <button
                onClick={() => handleDelete(s.key)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Remover credencial"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Formulário de gravar/trocar */}
      <form onSubmit={handleSave} className="space-y-3 pt-2 border-t border-zinc-800">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Definir / Substituir credencial
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            required
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            className="px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
            placeholder="NOME_DA_CHAVE (ex: PROVIDER_NVIDIA_KIMI_API_KEY)"
          />
          <input
            type="password"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="new-password"
            className="px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500"
            placeholder="Valor (••••)"
          />
        </div>
        {msg && <p className="text-xs text-indigo-400 font-medium">{msg}</p>}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Salvar credencial
          </button>
        </div>
      </form>
    </div>
  );
}
