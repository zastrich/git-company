"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

export function AgentDeleteButton({ companySlug, agentId, role }: { companySlug: string; agentId: string; role: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Remover o agente "${role}" (${agentId})?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/company/${companySlug}/agents?agentId=${encodeURIComponent(agentId)}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
      else {
        const d = await res.json();
        alert(d.error ?? "Erro ao remover.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleDelete} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30">
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  );
}
