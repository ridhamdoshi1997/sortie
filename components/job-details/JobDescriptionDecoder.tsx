"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ScanSearch, Sparkles } from "lucide-react";

import { decodeJobDescription } from "@/actions/jobs";
import type { Job } from "@/types";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

const CLASSIFICATION_LABEL: Record<"must_have" | "likely_padding", string> = {
  must_have: "Likely a must-have",
  likely_padding: "Likely padding",
};

const CLASSIFICATION_CLASS: Record<"must_have" | "likely_padding", string> = {
  must_have: "bg-accent-muted text-accent",
  likely_padding: "bg-surface-secondary text-text-muted",
};

// Job-description decoder (build-plan.md §B) — classifies this job's own
// Required list into genuine must-haves vs likely boilerplate, so a
// candidate can see at a glance where to spend real application effort.
export function JobDescriptionDecoder({ jobId, decoded }: { jobId: string; decoded: Job["jd_decoder"] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await decodeJobDescription(jobId);
      if (!result.success) {
        setError(result.error ?? "Could not decode this job's requirements.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">Requirement Decoder</h3>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleClick}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isPending ? "Decoding..." : decoded ? "Re-decode" : "Decode requirements"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-error">{error}</p>}

      {isPending && <AiThinkingCard className="mt-3" status="Classifying must-haves vs. boilerplate…" />}

      {!isPending && decoded ? (
        <ul className="mt-3 flex flex-col gap-2">
          {decoded.requirements.map((r, i) => (
            <li
              key={i}
              className="dim-card-in flex flex-col gap-1 rounded-lg bg-surface-secondary p-2.5"
              style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-text-primary">{r.text}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${CLASSIFICATION_CLASS[r.classification]}`}>
                  {CLASSIFICATION_LABEL[r.classification]}
                </span>
              </div>
              <p className="text-xs text-text-muted">{r.reasoning}</p>
            </li>
          ))}
        </ul>
      ) : (
        !isPending && (
          <p className="mt-2 text-xs text-text-muted">
            See which of this job&apos;s listed requirements are likely genuine must-haves vs. generic boilerplate.
          </p>
        )
      )}
    </div>
  );
}
