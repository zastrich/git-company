"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Loader2, Check } from "lucide-react";

export function SyncIndicator({ companySlug, dirtySince }: { companySlug: string; dirtySince: string | null }) {
  const router = useRouter();
  const [pushing, setPushing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!dirtySince && !done) return null;

  async function push() {
    setPushing(true);
    setError("");
    try {
      const res = await fetch(`/api/sync/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: "push" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success ?? true)) {
        setDone(true);
        router.refresh();
        setTimeout(() => setDone(false), 3000);
      } else {
        setError(data.message ?? data.error ?? "Falha ao sincronizar");
      }
    } catch {
      setError("Erro de conexão");
    } finally {
      setPushing(false);
    }
  }

  if (done && !dirtySince) {
    return (
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white shadow-2xl">
        <Check className="w-4 h-4" /> Sincronizado com o GitHub
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm p-4 rounded-2xl border border-amber-500/40 bg-zinc-900 shadow-2xl space-y-3">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 mt-0.5">
          <CloudUpload className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">Mudanças pendentes de sincronização</p>
          <p className="text-xs text-zinc-400">Há alterações locais que ainda não foram enviadas ao repositório no GitHub.</p>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      </div>
      <button
        onClick={push}
        disabled={pushing}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm disabled:opacity-60"
      >
        {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
        Sincronizar agora (push)
      </button>
    </div>
  );
}
