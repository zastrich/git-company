"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, Check, X } from "lucide-react";

export function CompanyEditor({
  companySlug,
  initial,
}: {
  companySlug: string;
  initial: { name: string; mission: string; repoPrefix: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [name, setName] = useState(initial.name);
  const [mission, setMission] = useState(initial.mission);
  const [repoPrefix, setRepoPrefix] = useState(initial.repoPrefix);

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/company/${companySlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mission, repoPrefix }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Erro ao salvar."); return; }
      setOpen(false);
      router.refresh();
    } catch {
      setMsg("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700">
        <Pencil className="w-3.5 h-3.5" /> Editar
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">Editar Empresa</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Nome</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Prefixo de repositório</label>
                <input value={repoPrefix} onChange={(e) => setRepoPrefix(e.target.value)} className={`${inputCls} font-mono`} placeholder="comp-" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Missão</label>
                <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={3} className={inputCls} />
              </div>
              {msg && <p className="text-sm text-red-400">{msg}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-semibold">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
