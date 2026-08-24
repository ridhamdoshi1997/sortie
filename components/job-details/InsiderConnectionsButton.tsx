"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Lock, Users } from "lucide-react";

import { LimitReachedModal, type LimitReachedReason } from "@/components/shared/LimitReachedModal";

type Props = {
  jobId: string;
  // Server-computed from the current plan's insiderConnectionsMonthlyLimit
  // (find-jobs/[id]/page.tsx) — false means the plan's limit is 0 (Recon).
  // A Command-tier user who's used up their monthly cap is still `allowed`
  // here (the plan itself grants the feature); the API call below is what
  // catches that case and returns "monthly_cap_reached" instead.
  allowed: boolean;
};

type BlockedResponse = { success: false; error: string; reason?: LimitReachedReason; resetsAt?: string };

export function InsiderConnectionsButton({ jobId, allowed }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [limitModal, setLimitModal] = useState<{ reason: LimitReachedReason; message: string; resetsAt?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);

    // True interception — a Recon user never even reaches the network
    // call. This is a UX nicety on top of, never a substitute for, the
    // real server-side circuit breaker in app/api/agent/research/connections/route.ts.
    if (!allowed) {
      setLimitModal({
        reason: "upgrade_required",
        message: "Insider connection lookups are a Command feature — upgrade to unlock up to 7 real LinkedIn connections per month.",
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/agent/research/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const json = (await res.json()) as { success: boolean } | BlockedResponse;

        if (!res.ok || !json.success) {
          const blocked = json as BlockedResponse;
          if (blocked.reason) {
            setLimitModal({ reason: blocked.reason, message: blocked.error, resetsAt: blocked.resetsAt });
          } else {
            setError(blocked.error ?? "Connections lookup failed. Please try again.");
          }
          return;
        }

        router.refresh();
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {allowed ? <Users className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        {isPending ? "Finding connections..." : "Find Connections"}
      </button>
      {error && <p className="max-w-xs text-xs text-error">{error}</p>}
      {limitModal && (
        <LimitReachedModal
          reason={limitModal.reason}
          featureLabel="insider connection lookups"
          message={limitModal.message}
          resetsAt={limitModal.resetsAt}
          onClose={() => setLimitModal(null)}
        />
      )}
    </div>
  );
}
