"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Check, Flag, X, AlertTriangle, CalendarClock } from "lucide-react";

interface MilestoneDTO {
  number?: number;
  title: string;
  description: string;
  dueOn: string | null;
  state: "open" | "closed";
  openIssues?: number;
  closedIssues?: number;
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

export function RoadmapManager({ companySlug }: { companySlug: string }) {
  const [items, setItems] = useState<MilestoneDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/company/${companySlug}/milestones`);
    const data = await res.json();
    if (res.ok) setItems(data.milestones ?? []);
    else setError(data.error ?? "Erro ao carregar milestones.");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/company/${companySlug}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, dueOn: dueOn || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao criar."); return; }
      setTitle(""); setDescription(""); setDueOn(""); setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;

  if (error && items.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-amber-500/30 bg-amber-950/10 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        <div>
          <p className="text-sm text-white font-medium">Não foi possível carregar os milestones</p>
          <p className="text-xs text-zinc-400 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <p className="text-sm text-zinc-400">{items.length} milestone(s)</p>
        <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm">
          <Plus className="w-4 h-4" /> Novo milestone
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {open && (
        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Novo milestone</h3>
            <button onClick={() => setOpen(false)} className="p-1 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Título (ex: v1.0 — MVP)" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} placeholder="Descrição" />
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Prazo (opcional)</label>
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className={inputCls} />
          </div>
          <button onClick={save} disabled={saving || !title} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar
          </button>
        </div>
      )}

      {/* Timeline roadmap */}
      <div className="relative border-l-2 border-zinc-800 ml-3 space-y-6 py-2">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500 pl-6">Nenhum milestone ainda.</p>
        ) : (
          items.map((m) => {
            const total = (m.openIssues ?? 0) + (m.closedIssues ?? 0);
            const pct = total > 0 ? Math.round(((m.closedIssues ?? 0) / total) * 100) : 0;
            return (
              <div key={m.number} className="relative pl-6">
                <span className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${m.state === "closed" ? "bg-emerald-500 border-emerald-400" : "bg-zinc-900 border-indigo-400"}`} />
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      <Flag className="w-4 h-4 text-indigo-400" /> {m.title}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${m.state === "closed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"}`}>
                      {m.state === "closed" ? "concluído" : "aberto"}
                    </span>
                  </div>
                  {m.description && <p className="text-sm text-zinc-400 mt-1">{m.description}</p>}
                  <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                    {m.dueOn && (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="w-3.5 h-3.5" /> {new Date(m.dueOn).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    <span>{m.closedIssues ?? 0}/{total} issues ({pct}%)</span>
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
