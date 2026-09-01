"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { requestFullJobEvaluation } from "@/actions/jobs";
import { LimitReachedModal, type LimitReachedReason } from "@/components/shared/LimitReachedModal";

// Phase 3 of the 3-phase redesign (2026-09-01) — a job on the detail page
// only ever has the cheap lite pass by default now (score/reasoning/skills/
// Legitimacy grade, no dimension write-ups or JD extraction). This is the
// on-demand upgrade trigger, reusing RequestScoringButton.tsx's exact UX
// pattern (manual click, then a bounded poll) rather than auto-firing on
// page view — an automatic AI call on every open would spend real quota on
// repeat/incidental views with no user awareness, the same cost-discipline
// reasoning that keeps requestJobEvaluation itself a button, not a
// server-side effect.
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

export function RequestFullEvaluationButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [limitModal, setLimitModal] = useState<{ reason: LimitReachedReason; message: string; resetsAt?: string; canUpgrade?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!requested) return;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (attempts > MAX_POLL_ATTEMPTS) {
        clearInterval(interval);
        setPollTimedOut(true);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [requested, router]);

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await requestFullJobEvaluation(jobId);
      if (result.success) {
        setRequested(true);
      } else if (result.reason) {
        setLimitModal({ reason: result.reason, message: result.error, resetsAt: result.resetsAt, canUpgrade: result.canUpgrade });
      } else {
        setError(result.error ?? "Failed to start full evaluation");
      }
    });
  }

  if (requested) {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-text-muted">
        {pollTimedOut ? (
          "Taking longer than usual — refresh the page in a moment to check."
        ) : (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating full analysis — this usually takes a few seconds…
          </>
        )}
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
        Get full 10-dimension analysis
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
