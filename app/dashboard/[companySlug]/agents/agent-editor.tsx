"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check, X, Pencil } from "lucide-react";

interface ProviderOpt { slug: string; name: string; type: string }
interface AgentLite { agentId: string; role: string }

export interface AgentEditValue {
  agentId: string;
  role: string;
  type: "ai" | "human";
  context: string;
  providerSlug: string | null;
  model: string;
  tickIntervalSeconds: number;
  labels: string;
  subordinates: string;
  isCeo: boolean;
  githubUsername: string;
  mcpServersJson: string;
  cliToolsJson: string;
  contextFilesJson: string;
}

export function AgentEditor({
  companySlug,
  providers,
  allAgents,
  mode,
  initial,
}: {
  companySlug: string;
  providers: ProviderOpt[];
  allAgents: AgentLite[];
  mode: "create" | "edit";
  initial?: Partial<AgentEditValue>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [v, setV] = useState<AgentEditValue>({
    agentId: initial?.agentId ?? "",
    role: initial?.role ?? "",
    type: initial?.type ?? "ai",
    context: initial?.context ?? "",
    providerSlug: initial?.providerSlug ?? (providers[0]?.slug ?? null),
    model: initial?.model ?? "",
    tickIntervalSeconds: initial?.tickIntervalSeconds ?? 3600,
    labels: initial?.labels ?? "",
    subordinates: initial?.subordinates ?? "",
    isCeo: initial?.isCeo ?? false,
    githubUsername: initial?.githubUsername ?? "",
    mcpServersJson: initial?.mcpServersJson ?? "[]",
    cliToolsJson: initial?.cliToolsJson ?? "[]",
    contextFilesJson: initial?.contextFilesJson ?? "[]",
  });
  const [mcpJsonError, setMcpJsonError] = useState("");
  const [cliJsonError, setCliJsonError] = useState("");
  const [ctxJsonError, setCtxJsonError] = useState("");

  const isHuman = v.type === "human";
  const inputCls =
    "w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white text-sm focus:outline-none focus:border-indigo-500";

  function set<K extends keyof AgentEditValue>(k: K, val: AgentEditValue[K]) {
    setV((p) => ({ ...p, [k]: val }));
  }

  function toggleSubordinate(id: string) {
    const cur = v.subordinates.split(",").map((s) => s.trim()).filter(Boolean);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set("subordinates", next.join(","));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    let mcpServers: unknown[] = [];
    let cliTools: unknown[] = [];
    let contextFiles: unknown[] = [];
    if (!isHuman) {
      try {
        const parsed = JSON.parse(v.mcpServersJson || "[]");
        if (!Array.isArray(parsed)) throw new Error("não é um array");
        mcpServers = parsed;
      } catch {
        setMsg("Config de MCP Servers inválida — corrija o JSON antes de salvar.");
        return;
      }
      try {
        const parsed = JSON.parse(v.cliToolsJson || "[]");
        if (!Array.isArray(parsed)) throw new Error("não é um array");
        cliTools = parsed;
      } catch {
        setMsg("Config de Ferramentas CLI inválida — corrija o JSON antes de salvar.");
        return;
      }
      try {
        const parsed = JSON.parse(v.contextFilesJson || "[]");
        if (!Array.isArray(parsed)) throw new Error("não é um array");
        contextFiles = parsed;
      } catch {
        setMsg("Lista de Arquivos de contexto inválida — corrija o JSON antes de salvar.");
        return;
      }
    }

    setSaving(true);
    try {
      const method = mode === "create" ? "POST" : "PUT";
      const { mcpServersJson, cliToolsJson, contextFilesJson, ...rest } = v;
      const res = await fetch(`/api/company/${companySlug}/agents`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, mcpServers, cliTools, contextFiles }),
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

  const selectedSubs = v.subordinates.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <>
      {mode === "create" ? (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm">
          <Plus className="w-4 h-4" /> Novo Agente
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700">
          <Pencil className="w-3.5 h-3.5" /> Editar
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-white">{mode === "create" ? "Novo Agente" : `Editar: ${v.role}`}</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Papel</label>
                  <input required value={v.role} onChange={(e) => set("role", e.target.value)} className={inputCls} placeholder="Ex: Revisor Técnico" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">ID</label>
                  <input required value={v.agentId} onChange={(e) => set("agentId", e.target.value)} disabled={mode === "edit"} className={`${inputCls} font-mono disabled:opacity-60`} placeholder="revisor" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Tipo</label>
                  <select value={v.type} onChange={(e) => set("type", e.target.value as "ai" | "human")} className={inputCls}>
                    <option value="ai">IA</option>
                    <option value="human">Humano</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-300 mt-6">
                  <input type="checkbox" checked={v.isCeo} onChange={(e) => set("isCeo", e.target.checked)} className="w-4 h-4 rounded border-zinc-700 bg-zinc-800" />
                  Coordenador (CEO)
                </label>
              </div>

              {!isHuman && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Provider (LLM)</label>
                    <select value={v.providerSlug ?? ""} onChange={(e) => set("providerSlug", e.target.value)} className={inputCls}>
                      {providers.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Modelo</label>
                    <input value={v.model} onChange={(e) => set("model", e.target.value)} className={`${inputCls} font-mono`} placeholder="ex: openai/gpt-oss-20b" />
                  </div>
                </div>
              )}

              {isHuman && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">GitHub username</label>
                  <input value={v.githubUsername} onChange={(e) => set("githubUsername", e.target.value)} className={inputCls} placeholder="usuario-github" />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Escopo / instruções</label>
                <textarea value={v.context} onChange={(e) => set("context", e.target.value)} rows={3} className={inputCls} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Labels (csv)</label>
                  <input value={v.labels} onChange={(e) => set("labels", e.target.value)} className={`${inputCls} font-mono`} placeholder="backend,api" />
                </div>
                {!isHuman && (
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Intervalo (s)</label>
                    <input type="number" min={300} value={v.tickIntervalSeconds} onChange={(e) => set("tickIntervalSeconds", parseInt(e.target.value || "300", 10))} className={inputCls} />
                  </div>
                )}
              </div>

              {/* Subordinados */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Subordinados</label>
                <div className="flex flex-wrap gap-1.5">
                  {allAgents.filter((a) => a.agentId !== v.agentId).length === 0 ? (
                    <span className="text-xs text-zinc-500">Nenhum outro agente para vincular.</span>
                  ) : (
                    allAgents.filter((a) => a.agentId !== v.agentId).map((a) => {
                      const on = selectedSubs.includes(a.agentId);
                      return (
                        <button type="button" key={a.agentId} onClick={() => toggleSubordinate(a.agentId)}
                          className={`px-2.5 py-1 rounded-lg text-xs border ${on ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" : "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                          {a.role} <span className="font-mono opacity-70">({a.agentId})</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* MCP Servers (JSON) */}
              {!isHuman && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">MCP Servers (JSON)</label>
                  <textarea
                    value={v.mcpServersJson}
                    onChange={(e) => {
                      const val = e.target.value;
                      set("mcpServersJson", val);
                      try {
                        const parsed = JSON.parse(val || "[]");
                        if (!Array.isArray(parsed)) throw new Error();
                        setMcpJsonError("");
                      } catch {
                        setMcpJsonError("JSON inválido — informe um array de MCP Servers.");
                      }
                    }}
                    rows={6}
                    className={`${inputCls} font-mono`}
                    placeholder={'[\n  {\n    "id": "google-calendar",\n    "name": "Google Agenda",\n    "transport": "stdio",\n    "command": "npx",\n    "args": ["-y", "@exemplo/mcp-google-calendar"],\n    "env": { "GOOGLE_TOKEN": "{{GOOGLE_TOKEN}}" }\n  }\n]'}
                  />
                  {mcpJsonError ? (
                    <p className="text-xs text-red-400 mt-1">{mcpJsonError}</p>
                  ) : (
                    <p className="text-xs text-zinc-500 mt-1">
                      Lista de MCP Servers disponíveis para o agente. Use <code className="font-mono">{"{{NOME_DO_SECRET}}"}</code> para referenciar secrets da empresa (nunca cole valores reais aqui).
                    </p>
                  )}
                </div>
              )}

              {/* Ferramentas CLI (JSON) */}
              {!isHuman && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Ferramentas CLI (JSON)</label>
                  <textarea
                    value={v.cliToolsJson}
                    onChange={(e) => {
                      const val = e.target.value;
                      set("cliToolsJson", val);
                      try {
                        const parsed = JSON.parse(val || "[]");
                        if (!Array.isArray(parsed)) throw new Error();
                        setCliJsonError("");
                      } catch {
                        setCliJsonError("JSON inválido — informe um array de ferramentas CLI.");
                      }
                    }}
                    rows={6}
                    className={`${inputCls} font-mono`}
                    placeholder={'[\n  {\n    "id": "gh-issue",\n    "name": "Criar issue",\n    "description": "Cria uma issue no repositório",\n    "command": "gh",\n    "args": [\n      { "literal": "issue" },\n      { "literal": "create" },\n      { "param": "title", "required": true }\n    ]\n  }\n]'}
                  />
                  {cliJsonError ? (
                    <p className="text-xs text-red-400 mt-1">{cliJsonError}</p>
                  ) : (
                    <p className="text-xs text-zinc-500 mt-1">
                      O <code className="font-mono">command</code> e os <code className="font-mono">literal</code> são fixos; a LLM só preenche os <code className="font-mono">param</code>. Prefira flags nomeadas e coloque argumentos posicionais antes de parâmetros opcionais. Use <code className="font-mono">{"{{NOME_DO_SECRET}}"}</code> em <code className="font-mono">env</code> (nunca cole valores reais aqui).
                    </p>
                  )}
                </div>
              )}

              {/* Arquivos de contexto (.md) (JSON) */}
              {!isHuman && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">Arquivos de contexto (.md) (JSON)</label>
                  <textarea
                    value={v.contextFilesJson}
                    onChange={(e) => {
                      const val = e.target.value;
                      set("contextFilesJson", val);
                      try {
                        const parsed = JSON.parse(val || "[]");
                        if (!Array.isArray(parsed)) throw new Error();
                        setCtxJsonError("");
                      } catch {
                        setCtxJsonError("JSON inválido — informe um array de caminhos.");
                      }
                    }}
                    rows={3}
                    className={`${inputCls} font-mono`}
                    placeholder={'["docs/agents/eisenhower.md"]'}
                  />
                  {ctxJsonError ? (
                    <p className="text-xs text-red-400 mt-1">{ctxJsonError}</p>
                  ) : (
                    <p className="text-xs text-zinc-500 mt-1">
                      Caminhos relativos ao workspace para contexto grande em <code className="font-mono">.md</code>. Caminhos absolutos ou com <code className="font-mono">..</code> são rejeitados.
                    </p>
                  )}
                </div>
              )}

              {msg && <p className="text-sm text-red-400">{msg}</p>}

              <div className="flex gap-3 pt-2">
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
