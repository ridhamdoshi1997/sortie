"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { requestJobEvaluation } from "@/actions/jobs";
import { LimitReachedModal, type LimitReachedReason } from "@/components/shared/LimitReachedModal";

// Manual "score this job" trigger (direct user request, 2026-08-28) — see
// requestJobEvaluation's own comment in actions/jobs.ts for why this exists:
// raising the SerpApi page cap means a single search can now return more
// jobs than a day's evaluation quota covers, so some jobs sit unscored with
// no way to fix it. This spends one evaluation from that same daily quota
// on this specific job. router.refresh() re-reads the job row server-side
// once Inngest's real evaluation finishes; once it has a real score, this
// component's parent (JobIdentityRail) stops rendering it at all, in favor
// of the real score UI — the natural "done" signal, no local done-state
// needed here.
//
// Real bug found live (2026-08-30, direct user report): this used to fire
// a SINGLE router.refresh() 4 seconds after requesting evaluation, on the
// assumption a single job always evaluates that fast. It doesn't always —
// real AI-call latency varies, and a one-shot refresh that lands too early
// left the spinner showing forever with no further automatic refresh; only
// a manual page reload (which re-fetches fresh server data on its own)
// picked up the real score. Fixed to a genuine repeating poll, same idiom
// FindJobsForm.tsx already uses for multi-job searches, bounded to 20
// attempts (~60s) so a genuinely failed evaluation doesn't poll forever.
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

export function RequestScoringButton({ jobId }: { jobId: string }) {
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
      const result = await requestJobEvaluation(jobId);
      if (result.success) {
        setRequested(true);
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
        {pollTimedOut ? (
          "Taking longer than usual — refresh the page in a moment to check."
        ) : (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Scoring — this usually takes a few seconds…
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
