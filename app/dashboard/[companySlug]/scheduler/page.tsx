"use client";

import { useState, useEffect, useRef } from "react";
import { Activity, Play, Square, RefreshCcw } from "lucide-react";
import { use } from "react";

export default function SchedulerClient({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = use(params);
  const [status, setStatus] = useState<"RUNNING" | "STOPPED" | "LOADING">("LOADING");
  const [pid, setPid] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/scheduler/${companySlug}`);
      const data = await res.json();
      setStatus(data.status);
      setPid(data.pid);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companySlug]);

  const handleAction = async (action: "start" | "stop") => {
    setIsLoading(true);
    try {
      await fetch(`/api/scheduler/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await fetchStatus();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Scheduler</h1>
        <p className="text-zinc-400 mt-2">
          Gerencie o processo em background que roda os agentes.
        </p>
      </div>

      <div className="p-8 rounded-3xl border border-zinc-800 bg-zinc-900/50 max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-2xl ${status === 'RUNNING' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
              <Activity className={`w-8 h-8 ${status === 'RUNNING' ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-400 mb-1">Status Atual</p>
              <h2 className={`text-3xl font-bold ${status === 'RUNNING' ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {status}
              </h2>
              {pid && <p className="text-xs text-zinc-500 mt-1">PID: {pid}</p>}
            </div>
          </div>
          
          <button 
            onClick={fetchStatus}
            className="p-2 text-zinc-500 hover:text-white transition-colors"
            title="Atualizar"
          >
            <RefreshCcw className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => handleAction("start")}
            disabled={status === "RUNNING" || isLoading}
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-5 h-5" />
            Iniciar Scheduler
          </button>
          <button
            onClick={() => handleAction("stop")}
            disabled={status !== "RUNNING" || isLoading}
            className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Square className="w-5 h-5" />
            Parar Processo
          </button>
        </div>
      </div>
    </div>
  );
}
