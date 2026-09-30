"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Check, Trash2, Pencil, Tag, X, AlertTriangle } from "lucide-react";

interface LabelDTO { name: string; color: string; description: string }

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

export function LabelsManager({ companySlug }: { companySlug: string }) {
  const [labels, setLabels] = useState<LabelDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null); // currentName
  const [form, setForm] = useState<LabelDTO>({ name: "", color: "6f42c1", description: "" });
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/company/${companySlug}/labels`);
    const data = await res.json();
    if (res.ok) setLabels(data.labels ?? []);
    else setError(data.error ?? "Erro ao carregar etiquetas.");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function startCreate() {
    setEditing(null);
    setForm({ name: "", color: "6f42c1", description: "" });
    setCreating(true);
  }
  function startEdit(l: LabelDTO) {
    setCreating(false);
    setEditing(l.name);
    setForm({ ...l });
  }
  function cancel() { setCreating(false); setEditing(null); }

  async function save() {
    setSaving(true);
    try {
      const isEdit = editing !== null;
      const res = await fetch(`/api/company/${companySlug}/labels`, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { currentName: editing, ...form } : form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro ao salvar."); return; }
      cancel();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(name: string) {
    if (!confirm(`Remover a etiqueta "${name}"?`)) return;
    const res = await fetch(`/api/company/${companySlug}/labels?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    if (res.ok) await load();
    else { const d = await res.json(); setError(d.error ?? "Erro ao remover."); }
  }

  if (loading) return <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;

  if (error && labels.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-amber-500/30 bg-amber-950/10 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        <div>
          <p className="text-sm text-white font-medium">Não foi possível carregar as etiquetas</p>
          <p className="text-xs text-zinc-400 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const formOpen = creating || editing !== null;

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <p className="text-sm text-zinc-400">{labels.length} etiqueta(s)</p>
        <button onClick={startCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm">
          <Plus className="w-4 h-4" /> Nova etiqueta
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {formOpen && (
        <div className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">{editing !== null ? "Editar etiqueta" : "Nova etiqueta"}</h3>
            <button onClick={cancel} className="p-1 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${inputCls} font-mono`} placeholder="nome" />
            <div className="flex items-center gap-2">
              <input type="color" value={`#${form.color.replace(/^#/, "")}`} onChange={(e) => setForm({ ...form, color: e.target.value.replace(/^#/, "") })} className="h-10 w-12 rounded-lg bg-zinc-800 border border-zinc-700" />
              <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value.replace(/^#/, "") })} className={`${inputCls} font-mono`} placeholder="cor hex" />
            </div>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="descrição" />
          </div>
          <button onClick={save} disabled={saving || !form.name} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {labels.map((l) => (
          <div key={l.name} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: `#${l.color.replace(/^#/, "")}` }} />
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-sm font-mono text-zinc-200">
                  <Tag className="w-3.5 h-3.5 text-zinc-500" /> {l.name}
                </span>
                {l.description && <p className="text-xs text-zinc-500 truncate">{l.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => startEdit(l)} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => remove(l.name)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
