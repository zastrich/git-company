"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Loader2, Check, AlertTriangle } from "lucide-react";

export function RepoManager({
  companySlug,
  initialOwner,
  initialRepo,
}: {
  companySlug: string;
  initialOwner: string;
  initialRepo: string;
}) {
  const router = useRouter();
  const [owner, setOwner] = useState(initialOwner);
  const [repo, setRepo] = useState(initialRepo);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [decision, setDecision] = useState<null | "exists" | "free">(null);

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

  async function call(action: "check" | "link" | "create") {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/company/${companySlug}/repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, owner, repo }),
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } finally {
      setLoading(false);
    }
  }

  async function handleCheck() {
    const { ok, data } = await call("check");
    if (!ok) { setMsg(data.error ?? "Erro ao verificar."); return; }
    setDecision(data.exists ? "exists" : "free");
    setMsg(data.exists
      ? "Este repositório já existe no GitHub. Você quer vincular ao existente ou criar um novo com outro nome?"
      : "Repositório disponível. Você pode criá-lo agora.");
  }

  async function handleLink() {
    const { ok, data } = await call("link");
    if (!ok) { setMsg(data.error ?? "Erro ao vincular."); return; }
    setMsg(`Vinculado a ${data.linked}.`);
    setDecision(null);
    router.refresh();
  }

  async function handleCreate() {
    const { ok, data, status } = await call("create");
    if (!ok) {
      if (status === 409) { setDecision("exists"); setMsg(data.error); return; }
      setMsg(data.error ?? "Erro ao criar."); return;
    }
    setMsg(`Repositório ${data.created} criado e sincronizado.`);
    setDecision(null);
    router.refresh();
  }

  return (
    <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
        <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400">
          <GitBranch className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Repositório GitHub</h3>
          <p className="text-xs text-zinc-400">Altere o usuário/repositório. Usa o token GitHub global.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Owner</label>
          <input value={owner} onChange={(e) => { setOwner(e.target.value); setDecision(null); }} className={inputCls} placeholder="usuário/org" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Repositório</label>
          <input value={repo} onChange={(e) => { setRepo(e.target.value); setDecision(null); }} className={`${inputCls} font-mono`} placeholder="comp-org" />
        </div>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 text-sm ${decision === "exists" ? "text-amber-300" : "text-zinc-300"}`}>
          {decision === "exists" && <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{msg}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {decision === null && (
          <button onClick={handleCheck} disabled={loading || !owner || !repo} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
            Verificar disponibilidade
          </button>
        )}

        {decision === "free" && (
          <button onClick={handleCreate} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-60">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Criar repositório e sincronizar
          </button>
        )}

        {decision === "exists" && (
          <>
            <button onClick={handleLink} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Vincular ao existente
            </button>
            <button onClick={() => { setDecision(null); setMsg("Altere o nome do repositório e verifique novamente."); }} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold">
              Usar outro nome
            </button>
          </>
        )}
      </div>
    </div>
  );
}
