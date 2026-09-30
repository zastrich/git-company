"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Wand2, Check, GitBranch, Plus, Trash2 } from "lucide-react";

interface ProviderOpt {
  slug: string;
  name: string;
  type: string;
  baseUrl: string | null;
}

interface PlanColumn { name: string; description?: string; isManualAction?: boolean; isDone?: boolean }
interface PlanLabel { name: string; color: string; description: string }
interface PlanAgent {
  agentId: string; role: string; type: "ai" | "human";
  context: string; labels: string[]; subordinates?: string[];
  isCeo?: boolean; githubUsername?: string;
}
interface ProjectPlan {
  companyName: string; slug: string; mission: string; repoPrefix: string;
  columns: PlanColumn[]; labels: PlanLabel[]; agents: PlanAgent[];
  completionPatterns: string[];
}

/** modelo sugerido por tipo de provider */
function suggestedModel(type: string): string {
  switch (type) {
    case "custom": return "openai/gpt-oss-20b";
    case "openai": return "gpt-4o-mini";
    case "anthropic": return "claude-3-5-sonnet-20241022";
    case "gemini": return "gemini-3.8-flash";
    case "groq": return "llama-3.3-70b-versatile";
    case "ollama": return "llama3";
    case "local": return "local-organizer-v1";
    default: return "";
  }
}

export function OnboardingWizard({ providers }: { providers: ProviderOpt[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — prefere Gemini como assistente padrão (rápido + 1M de contexto).
  const preferred = providers.find((p) => p.type === "gemini") ?? providers[0];
  const [providerSlug, setProviderSlug] = useState(preferred?.slug ?? "");
  const [model, setModel] = useState(suggestedModel(preferred?.type ?? ""));
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [planSource, setPlanSource] = useState<"llm" | "fallback" | null>(null);

  // Step 2
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [githubToken, setGithubToken] = useState("");
  const [githubOwner, setGithubOwner] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");
  // fluxo do kanban: configurar agora ou deixar para depois
  const [configureFlow, setConfigureFlow] = useState(true);

  function onProviderChange(slug: string) {
    setProviderSlug(slug);
    const p = providers.find((x) => x.slug === slug);
    setModel(suggestedModel(p?.type ?? ""));
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setMsg("");
    try {
      const res = await fetch("/api/onboarding/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, providerSlug, model }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Erro ao gerar plano."); return; }
      setPlan(data.plan);
      setPlanSource(data.source);
      setStep(2);
    } catch {
      setMsg("Erro de conexão.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreate() {
    if (!plan) return;
    setCreating(true);
    setMsg("");
    try {
      // Se o usuário optou por não configurar o fluxo agora, envia sem colunas —
      // o kanban poderá ser gerado por IA depois, no board do projeto.
      const planToSend = configureFlow ? plan : { ...plan, columns: [] };
      const res = await fetch("/api/onboarding/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planToSend, providerSlug, model,
          githubToken: githubToken || undefined,
          githubOwner: githubOwner || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Erro ao criar projeto."); return; }
      router.push(`/dashboard/${data.slug}`);
    } catch {
      setMsg("Erro de conexão.");
    } finally {
      setCreating(false);
    }
  }

  // Helpers de edição do plano
  function updatePlan(patch: Partial<ProjectPlan>) {
    setPlan((p) => (p ? { ...p, ...patch } : p));
  }
  function updateAgent(i: number, patch: Partial<PlanAgent>) {
    setPlan((p) => {
      if (!p) return p;
      const agents = [...p.agents];
      agents[i] = { ...agents[i], ...patch };
      return { ...p, agents };
    });
  }
  function removeAgent(i: number) {
    setPlan((p) => (p ? { ...p, agents: p.agents.filter((_, idx) => idx !== i) } : p));
  }
  function addAgent() {
    setPlan((p) =>
      p
        ? {
            ...p,
            agents: [
              ...p.agents,
              { agentId: `agente-${p.agents.length + 1}`, role: "Colaborador", type: "ai", context: "", labels: [], isCeo: false },
            ],
          }
        : p
    );
  }

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

  // ── STEP 1 ────────────────────────────────────────────────
  if (step === 1) {
    return (
      <form onSubmit={handleGenerate} className="space-y-6">
        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <Sparkles className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-white">1. LLM assistente</h2>
          </div>

          {providers.length === 0 ? (
            <p className="text-sm text-amber-400">
              Nenhum provider cadastrado. Cadastre um provider de IA primeiro.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Provider</label>
                <select value={providerSlug} onChange={(e) => onProviderChange(e.target.value)} className={inputCls}>
                  {providers.map((p) => (
                    <option key={p.slug} value={p.slug}>{p.name} ({p.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Modelo</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} className={`${inputCls} font-mono`} placeholder="ex: openai/gpt-oss-20b" />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
          <div className="flex items-center gap-2 text-indigo-400">
            <Wand2 className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-white">2. Descreva o projeto</h2>
          </div>
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className={inputCls}
            placeholder="Ex: Quero organizar meu TCC de engenharia. Preciso escrever a monografia, rodar experimentos e preparar a apresentação. Trabalho sozinho, mas quero um assistente que priorize tarefas e outro que revise texto."
          />
        </div>

        {msg && <p className="text-sm text-red-400">{msg}</p>}

        <button
          type="submit"
          disabled={generating || providers.length === 0}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          Gerar plano com IA
        </button>
      </form>
    );
  }

  // ── STEP 2 ────────────────────────────────────────────────
  if (!plan) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className={`text-xs px-3 py-1 rounded-full border ${planSource === "llm" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}>
          {planSource === "llm" ? "Plano gerado pela IA" : "Plano padrão (IA indisponível — edite abaixo)"}
        </span>
        <button onClick={() => setStep(1)} className="text-sm text-zinc-400 hover:text-white">← Refazer</button>
      </div>

      {/* Identificação */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
        <h2 className="text-lg font-semibold text-white">Identificação</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Nome</label>
            <input value={plan.companyName} onChange={(e) => updatePlan({ companyName: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Slug</label>
            <input value={plan.slug} onChange={(e) => updatePlan({ slug: e.target.value })} className={`${inputCls} font-mono`} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Missão</label>
          <input value={plan.mission} onChange={(e) => updatePlan({ mission: e.target.value })} className={inputCls} />
        </div>
      </div>

      {/* Colunas / etapas */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Fluxo do kanban (etapas sugeridas)</h2>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={configureFlow} onChange={(e) => setConfigureFlow(e.target.checked)} className="w-4 h-4 rounded border-zinc-700 bg-zinc-800" />
            Configurar agora
          </label>
        </div>
        {configureFlow ? (
          <>
            <p className="text-xs text-zinc-500">A IA sugeriu este fluxo. Ele será criado no board do projeto.</p>
            <div className="flex flex-wrap gap-2">
              {plan.columns.map((c, i) => (
                <span key={i} className={`px-3 py-1.5 rounded-lg text-xs border ${c.isDone ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : c.isManualAction ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-zinc-800 text-zinc-300 border-zinc-700"}`}>
                  {c.name}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-amber-400">
            Você optou por não configurar o fluxo agora. Poderá criar o kanban com IA depois, direto no board do projeto.
          </p>
        )}
      </div>

      {/* Labels */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-3">
        <h2 className="text-lg font-semibold text-white">Etiquetas</h2>
        <div className="flex flex-wrap gap-2">
          {plan.labels.map((l, i) => (
            <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-mono border border-zinc-700 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `#${l.color}` }} />
              {l.name}
            </span>
          ))}
        </div>
      </div>

      {/* Agentes */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Agentes &amp; colaboradores</h2>
          <button onClick={addAgent} className="inline-flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300">
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        </div>
        <div className="space-y-3">
          {plan.agents.map((a, i) => (
            <div key={i} className="p-4 rounded-xl bg-zinc-800/40 border border-zinc-700/50 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input value={a.role} onChange={(e) => updateAgent(i, { role: e.target.value })} className={inputCls} placeholder="Papel" />
                <input value={a.agentId} onChange={(e) => updateAgent(i, { agentId: e.target.value })} className={`${inputCls} font-mono`} placeholder="id" />
                <select value={a.type} onChange={(e) => updateAgent(i, { type: e.target.value as "ai" | "human" })} className={inputCls}>
                  <option value="ai">IA</option>
                  <option value="human">Humano</option>
                </select>
              </div>
              <textarea value={a.context} onChange={(e) => updateAgent(i, { context: e.target.value })} rows={2} className={inputCls} placeholder="Escopo / instruções" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={Boolean(a.isCeo)} onChange={(e) => updateAgent(i, { isCeo: e.target.checked })} className="w-4 h-4 rounded border-zinc-700 bg-zinc-800" />
                  Coordenador (CEO)
                </label>
                <button onClick={() => removeAgent(i)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GitHub opcional */}
      <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 space-y-4">
        <div className="flex items-center gap-2 text-zinc-300">
          <GitBranch className="w-5 h-5" />
          <h2 className="text-lg font-semibold text-white">GitHub (opcional)</h2>
        </div>
        <p className="text-xs text-zinc-400">
          Informe owner + token para criar o repositório <code>{plan.repoPrefix}org</code>, commitar o business.json e aplicar as etiquetas. Deixe em branco para criar apenas localmente.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input value={githubOwner} onChange={(e) => setGithubOwner(e.target.value)} className={inputCls} placeholder="owner (usuário/org)" />
          <input type="password" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} autoComplete="new-password" className={inputCls} placeholder="token (••••)" />
        </div>
      </div>

      {msg && <p className="text-sm text-red-400">{msg}</p>}

      <button
        onClick={handleCreate}
        disabled={creating}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all disabled:opacity-60"
      >
        {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
        Criar projeto
      </button>
    </div>
  );
}
