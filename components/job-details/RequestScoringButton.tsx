"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { requestJobEvaluation } from "@/actions/jobs";
import { LimitReachedModal, type LimitReachedReason } from "@/components/shared/LimitReachedModal";

// Manual "score this job" trigger (direct user request, 2026-08-28) — see
// requestJobEvaluation's own comment in actions/jobs.ts for why this exists:
// raising the SerpApi page cap means a single search can now return more
// jobs than a day's evaluation quota covers, so some jobs sit unscored with
// no way to fix it. This spends one evaluation from that same daily quota
// on this specific job. router.refresh() re-reads the job row server-side
// once Inngest's real evaluation finishes — same polling idiom the rest of
// this app already uses for "in progress" AI work, just triggered manually
// here instead of on an interval, since a single job's evaluation is fast
// enough that the user re-checking once is enough.
export function RequestScoringButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [limitModal, setLimitModal] = useState<{ reason: LimitReachedReason; message: string; resetsAt?: string; canUpgrade?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await requestJobEvaluation(jobId);
      if (result.success) {
        setRequested(true);
        // Real evaluation runs async via Inngest — one refresh a few
        // seconds later is enough to pick up the result for a single job
        // (chunked batches of many jobs are the slow case, not this).
        setTimeout(() => router.refresh(), 4000);
      } else if (result.reason) {
        setLimitModal({ reason: result.reason, message: result.error, resetsAt: result.resetsAt, canUpgrade: result.canUpgrade });
      } else {
        setError(result.error ?? "Failed to start scoring");
      }
    });
  }

  if (requested) {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-text-muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        Scoring — this usually takes a few seconds…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="glass-pill inline-flex min-h-8 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Score this job
      </button>
      {error && <p className="text-[11px] text-error">{error}</p>}
      {limitModal && (
        <LimitReachedModal
          reason={limitModal.reason}
          featureLabel="job evaluations"
          message={limitModal.message}
          resetsAt={limitModal.resetsAt}
          canUpgrade={limitModal.canUpgrade}
          onClose={() => setLimitModal(null)}
        />
      )}
    </div>
  );
}
