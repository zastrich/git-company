"use client";

import { useState } from "react";
import { ArrowUpRight, ArrowDownLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export function SyncButton({
  companySlug,
  direction,
}: {
  companySlug: string;
  direction: "push" | "pull";
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/sync/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResult({ success: true, message: data.message });
        router.refresh();
      } else {
        setResult({ success: false, message: data.message || data.error || "Erro ao sincronizar." });
      }
    } catch {
      setResult({ success: false, message: "Erro de rede durante a sincronização." });
    } finally {
      setLoading(false);
    }
  }

  const isPush = direction === "push";

  return (
    <div className="space-y-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all shadow-lg ${
          isPush
            ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
            : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isPush ? (
          <ArrowUpRight className="w-4 h-4" />
        ) : (
          <ArrowDownLeft className="w-4 h-4" />
        )}
        {isPush ? "Push Local → GitHub" : "Pull GitHub → Local"}
      </button>

      {result && (
        <div
          className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${
            result.success
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          }`}
        >
          {result.success ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
}
