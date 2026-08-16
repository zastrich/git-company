"use client";

import { useState } from "react";
import { Pause, Play, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function AgentPauseButton({
  agentId,
  companySlug,
  initialIsPaused,
}: {
  agentId: string;
  companySlug: string;
  initialIsPaused: boolean;
}) {
  const [isPaused, setIsPaused] = useState(initialIsPaused);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/toggle-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companySlug }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsPaused(data.isPaused);
        router.refresh();
      }
    } catch (err) {
      console.error("Erro ao alterar status:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
        isPaused
          ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30"
          : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
      }`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isPaused ? (
        <>
          <Play className="w-3.5 h-3.5 fill-current" />
          Retomar
        </>
      ) : (
        <>
          <Pause className="w-3.5 h-3.5 fill-current" />
          Pausar
        </>
      )}
    </button>
  );
}
