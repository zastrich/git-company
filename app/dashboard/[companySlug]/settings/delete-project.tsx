"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";

export function DeleteProject({ companySlug }: { companySlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleDelete() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/company/${companySlug}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Erro ao remover."); setLoading(false); return; }
      router.push("/");
    } catch {
      setMsg("Erro de conexão.");
      setLoading(false);
    }
  }

  return (
    <div className="p-6 rounded-2xl border border-red-500/30 bg-red-950/10 space-y-4">
      <div className="flex items-center gap-3 border-b border-red-500/20 pb-4">
        <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Zona de Perigo</h3>
          <p className="text-xs text-zinc-400">Remove o projeto apenas desta máquina (banco local). O repositório no GitHub não é afetado.</p>
        </div>
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600/90 hover:bg-red-500 text-white font-semibold text-sm"
        >
          <Trash2 className="w-4 h-4" /> Remover projeto localmente
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-300">
            Para confirmar, digite o slug do projeto: <span className="font-mono text-red-300">{companySlug}</span>
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm font-mono focus:outline-none focus:border-red-500"
            placeholder={companySlug}
          />
          {msg && <p className="text-sm text-red-400">{msg}</p>}
          <div className="flex gap-3">
            <button onClick={() => { setOpen(false); setConfirmText(""); }} className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-semibold">
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={loading || confirmText !== companySlug}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Remover definitivamente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
