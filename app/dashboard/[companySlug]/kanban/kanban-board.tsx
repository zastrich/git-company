"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Bot, Play, ExternalLink, Plus, RefreshCw, Copy, GitFork, MoveRight, Info, X, Sparkles } from "lucide-react";

interface StageContext { name: string; description?: string; input?: string; output?: string; isManualAction?: boolean; isDone?: boolean }
interface KanbanCard {
  number: number; title: string; url: string; state: "open" | "closed";
  stage: string; assignedAgent: string | null; running: boolean; labels: string[];
}
interface KanbanColumn { name: string; cards: KanbanCard[]; context?: StageContext }
interface AgentLite { agentId: string; role: string }
interface MilestoneLite { number?: number; title: string }
interface ProviderLite { slug: string; name: string; type: string }
type RelationType = "parent" | "related" | "blocked-by" | "blocking";

const inputCls = "w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

export function KanbanBoard({ companySlug }: { companySlug: string }) {
  const [board, setBoard] = useState<KanbanColumn[]>([]);
  const [agents, setAgents] = useState<AgentLite[]>([]);
  const [milestones, setMilestones] = useState<MilestoneLite[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  // fluxo configurado + assistente do projeto (para "Criar com IA")
  const [flowConfigured, setFlowConfigured] = useState(true);
  const [noRepo, setNoRepo] = useState(false);
  const [repoMessage, setRepoMessage] = useState("");
  const [availableProviders, setAvailableProviders] = useState<ProviderLite[]>([]);
  const [flowProvider, setFlowProvider] = useState("");
  const [flowModel, setFlowModel] = useState("");
  const [flowDesc, setFlowDesc] = useState("");

  // modal de criação
  const [modal, setModal] = useState<null | { stage: string; relateTo?: number }>(null);
  // popover de contexto da etapa
  const [ctxOpen, setCtxOpen] = useState<string | null>(null);
  // drag & drop
  const [dragging, setDragging] = useState<KanbanCard | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  async function handleDrop(toStage: string, isDone: boolean) {
    const card = dragging;
    setDragOver(null);
    setDragging(null);
    if (!card || card.stage === toStage) return;
    // Move otimista: atualiza o board localmente antes da confirmação do servidor.
    setBoard((prev) => prev.map((col) => {
      if (col.name === card.stage) return { ...col, cards: col.cards.filter((c) => c.number !== card.number) };
      if (col.name === toStage) return { ...col, cards: [...col.cards, { ...card, stage: toStage }] };
      return col;
    }));
    await action({ action: "move-card", number: card.number, toStage, isDone }, `move-${card.number}`);
  }

  const roleOf = (agentId: string | null) => agentId ? (agents.find((a) => a.agentId === agentId)?.role ?? agentId) : null;
  const allCards = board.flatMap((c) => c.cards);

  async function load() {
    setLoading(true); setError("");
    const res = await fetch(`/api/company/${companySlug}/kanban`);
    const data = await res.json();
    if (res.ok) {
      setBoard(data.board ?? []); setAgents(data.agents ?? []);
      setMilestones(data.milestones ?? []); setProjectId(data.projectId ?? null);
      setFlowConfigured(data.flowConfigured ?? true);
      setNoRepo(data.noRepo ?? false);
      setRepoMessage(data.repoMessage ?? "");
      setAvailableProviders(data.availableProviders ?? []);
      // pré-seleciona o assistente usado na criação do projeto
      if (data.assistant?.providerSlug) setFlowProvider(data.assistant.providerSlug);
      else if (data.availableProviders?.[0]) setFlowProvider(data.availableProviders[0].slug);
      if (data.assistant?.model) setFlowModel(data.assistant.model);
    } else setError(data.error ?? "Erro ao carregar o board.");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function action(payload: any, label: string) {
    setBusy(label);
    try {
      const res = await fetch(`/api/company/${companySlug}/kanban`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erro."); return null; }
      await load();
      return data;
    } finally { setBusy(""); }
  }

  if (loading) return <div className="flex items-center gap-2 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Carregando board…</div>;

  if (error && board.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-amber-500/30 bg-amber-950/10 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
        <div><p className="text-sm text-white font-medium">Não foi possível carregar o board</p><p className="text-xs text-zinc-400 mt-1">{error}</p></div>
      </div>
    );
  }

  const totalCards = allCards.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          {totalCards} card(s) em {board.length} etapa(s)
          <span className="hidden md:inline text-xs text-zinc-600">· arraste os cards entre as etapas</span>
          {projectId
            ? <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Project vinculado</span>
            : <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-400 border border-zinc-700">Sem Project V2</span>}
        </div>
        <div className="flex items-center gap-2">
          {projectId && (
            <button onClick={() => action({ action: "sync-issues" }, "sync")} disabled={busy === "sync"} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold">
              {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sincronizar issues ao Project
            </button>
          )}
          {!projectId && (
            <button onClick={() => action({ action: "create-project" }, "create-project")} disabled={busy === "create-project"} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold">
              {busy === "create-project" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar Project no GitHub
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {noRepo && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-950/10 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm text-white font-medium">Board do GitHub indisponível</p>
            <p className="text-xs text-zinc-400 mt-1">
              {repoMessage || "Projeto sem repositório GitHub vinculado."} Você ainda pode definir o fluxo com IA abaixo; ele será aplicado ao criar/vincular o repositório.
            </p>
          </div>
        </div>
      )}

      {/* Fluxo ainda não configurado → oferecer criação com IA */}
      {!flowConfigured && (
        <div className="p-6 rounded-2xl border border-indigo-500/30 bg-indigo-950/10 space-y-4">
          <div className="flex items-center gap-2 text-indigo-300">
            <Sparkles className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-white">Fluxo do kanban não configurado</h2>
          </div>
          <p className="text-sm text-zinc-300">
            Este projeto ainda não tem etapas definidas. Gere um fluxo com IA usando o assistente do projeto (já pré-selecionado) ou escolha outro.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Assistente (LLM)</label>
              <select value={flowProvider} onChange={(e) => setFlowProvider(e.target.value)} className={inputCls}>
                {availableProviders.map((p) => <option key={p.slug} value={p.slug}>{p.name} ({p.type})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Modelo</label>
              <input value={flowModel} onChange={(e) => setFlowModel(e.target.value)} className={`${inputCls} font-mono`} placeholder="ex: openai/gpt-oss-20b" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Descrição do fluxo (opcional)</label>
            <textarea value={flowDesc} onChange={(e) => setFlowDesc(e.target.value)} rows={2} className={inputCls} placeholder="Ex: fluxo com backlog, desenvolvimento, revisão e publicação." />
          </div>
          <button
            onClick={async () => { await action({ action: "generate-flow", providerSlug: flowProvider, model: flowModel, description: flowDesc }, "gen-flow"); }}
            disabled={busy === "gen-flow" || !flowProvider}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm disabled:opacity-60"
          >
            {busy === "gen-flow" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Criar fluxo com IA
          </button>
        </div>
      )}

      {/* Board full width, rolagem horizontal só se faltar espaço */}
      <div className="flex gap-4 items-start overflow-x-auto pb-6">
        {board.map((col) => (
          <div
            key={col.name}
            onDragOver={(e) => { if (dragging) { e.preventDefault(); setDragOver(col.name); } }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(null); }}
            onDrop={(e) => { e.preventDefault(); handleDrop(col.name, Boolean(col.context?.isDone)); }}
            className={`group/col w-80 shrink-0 rounded-2xl border bg-zinc-900/30 hover:bg-zinc-900/60 transition-colors ${
              dragOver === col.name ? "border-indigo-500 bg-indigo-950/20 ring-2 ring-indigo-500/40" : "border-zinc-800 hover:border-zinc-700"
            }`}
          >
            {/* Header da coluna */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">{col.name}</h3>
                <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{col.cards.length}</span>
                {col.context?.isManualAction && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">manual</span>}
                {col.context?.isDone && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">done</span>}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover/col:opacity-100 transition-opacity">
                {col.context && (
                  <button onClick={() => setCtxOpen(ctxOpen === col.name ? null : col.name)} title="Contexto da etapa" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
                    <Info className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setModal({ stage: col.name })} title="Adicionar card" className="p-1.5 rounded-lg text-indigo-300 hover:text-white hover:bg-indigo-600">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Contexto da etapa (input/output) */}
            {ctxOpen === col.name && col.context && (
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/50 text-xs space-y-2">
                {col.context.description && <p className="text-zinc-300">{col.context.description}</p>}
                {col.context.input && <p className="text-zinc-400"><span className="text-indigo-400 font-semibold">Input:</span> {col.context.input}</p>}
                {col.context.output && <p className="text-zinc-400"><span className="text-emerald-400 font-semibold">Output:</span> {col.context.output}</p>}
              </div>
            )}

            {/* Cards */}
            <div className="p-3 space-y-3 min-h-[120px]">
              {col.cards.length === 0 ? (
                <button onClick={() => setModal({ stage: col.name })} className="w-full p-4 rounded-xl border border-dashed border-zinc-800 text-center text-xs text-zinc-600 hover:border-indigo-500/40 hover:text-indigo-300 transition-colors">
                  + adicionar card
                </button>
              ) : (
                col.cards.map((card) => (
                  <div
                    key={card.number}
                    draggable
                    onDragStart={() => setDragging(card)}
                    onDragEnd={() => { setDragging(null); setDragOver(null); }}
                    className={`group/card p-3 rounded-xl border border-zinc-800 bg-zinc-900/70 hover:border-indigo-500/40 transition-all cursor-grab active:cursor-grabbing ${
                      dragging?.number === card.number ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <a href={card.url} target="_blank" rel="noreferrer" className="text-sm text-zinc-200 leading-snug hover:text-indigo-300">{card.title}</a>
                      <a href={card.url} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5 text-zinc-600 shrink-0 mt-0.5" /></a>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 font-mono">#{card.number}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {card.assignedAgent && <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"><Bot className="w-3 h-3" /> {roleOf(card.assignedAgent)}</span>}
                      {card.running && <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 animate-pulse"><Play className="w-3 h-3 fill-current" /> executando</span>}
                    </div>

                    {/* Ações do card */}
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-zinc-800/60 opacity-0 group-hover/card:opacity-100 transition-opacity">
                      <MoveMenu columns={board.map((c) => ({ name: c.name, isDone: Boolean(c.context?.isDone) }))} current={card.stage}
                        onMove={(toStage, isDone) => action({ action: "move-card", number: card.number, toStage, isDone }, `move-${card.number}`)} busy={busy === `move-${card.number}`} />
                      <button onClick={() => setModal({ stage: card.stage, relateTo: card.number })} title="Criar card relacionado" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"><GitFork className="w-3.5 h-3.5" /></button>
                      <button onClick={() => action({ action: "clone-issue", number: card.number }, `clone-${card.number}`)} disabled={busy === `clone-${card.number}`} title="Clonar card" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
                        {busy === `clone-${card.number}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <CreateIssueModal
          companySlug={companySlug}
          stage={modal.stage}
          relateTo={modal.relateTo}
          agents={agents}
          milestones={milestones}
          allCards={allCards}
          onClose={() => setModal(null)}
          onCreated={async () => { setModal(null); await load(); }}
        />
      )}
    </div>
  );
}

function MoveMenu({ columns, current, onMove, busy }: {
  columns: { name: string; isDone: boolean }[]; current: string;
  onMove: (toStage: string, isDone: boolean) => void; busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} title="Mover para etapa" className="inline-flex items-center gap-1 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoveRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 w-44 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl py-1">
          {columns.filter((c) => c.name !== current).map((c) => (
            <button key={c.name} onClick={() => { setOpen(false); onMove(c.name, c.isDone); }} className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
              → {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateIssueModal({ companySlug, stage, relateTo, agents, milestones, allCards, onClose, onCreated }: {
  companySlug: string; stage: string; relateTo?: number;
  agents: AgentLite[]; milestones: MilestoneLite[]; allCards: KanbanCard[];
  onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [agentId, setAgentId] = useState<string>("");
  const [milestoneNumber, setMilestoneNumber] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [contextCards, setContextCards] = useState<number[]>([]);
  const [relType, setRelType] = useState<RelationType>("related");
  const [relTarget, setRelTarget] = useState<string>(relateTo ? String(relateTo) : "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function toggleContext(n: number) {
    setContextCards((cur) => cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]);
  }

  async function submit() {
    setSaving(true); setMsg("");
    const relations: { type: RelationType; number: number }[] = [];
    if (relTarget) relations.push({ type: relType, number: Number(relTarget) });
    for (const n of contextCards) relations.push({ type: "related", number: n });

    try {
      const res = await fetch(`/api/company/${companySlug}/kanban`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-issue", title, body, stage,
          agentId: agentId || null,
          milestoneNumber: milestoneNumber ? Number(milestoneNumber) : null,
          startDate: startDate || null, dueDate: dueDate || null, relations,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error ?? "Erro ao criar."); return; }
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <h3 className="text-lg font-bold text-white">Novo card em &ldquo;{stage}&rdquo;</h3>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Título do card" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={inputCls} placeholder="Descrição" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Agente responsável</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={inputCls}>
              <option value="">— nenhum —</option>
              {agents.map((a) => <option key={a.agentId} value={a.agentId}>{a.role}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Milestone</label>
            <select value={milestoneNumber} onChange={(e) => setMilestoneNumber(e.target.value)} className={inputCls}>
              <option value="">— nenhum —</option>
              {milestones.map((m) => <option key={m.number} value={m.number}>{m.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Início previsto</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Fim previsto</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Relacionamento */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Relacionamento</label>
          <div className="flex gap-2">
            <select value={relType} onChange={(e) => setRelType(e.target.value as RelationType)} className={inputCls}>
              <option value="parent">Card pai</option>
              <option value="related">Relacionado</option>
              <option value="blocked-by">Bloqueado por</option>
              <option value="blocking">Bloqueia</option>
            </select>
            <select value={relTarget} onChange={(e) => setRelTarget(e.target.value)} className={inputCls}>
              <option value="">— nenhum —</option>
              {allCards.map((c) => <option key={c.number} value={c.number}>#{c.number} {c.title.slice(0, 30)}</option>)}
            </select>
          </div>
        </div>

        {/* Cards de contexto */}
        {allCards.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Incluir cards como contexto</label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {allCards.map((c) => {
                const on = contextCards.includes(c.number);
                return (
                  <button key={c.number} type="button" onClick={() => toggleContext(c.number)}
                    className={`px-2 py-1 rounded-lg text-xs border ${on ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                    #{c.number}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {msg && <p className="text-sm text-red-400">{msg}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-semibold">Cancelar</button>
          <button onClick={submit} disabled={saving || !title} className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar card
          </button>
        </div>
      </div>
    </div>
  );
}
