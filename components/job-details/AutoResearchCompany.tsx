"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, RotateCw } from "lucide-react";

import type { CompanyResearchDossier } from "@/types";

type Props = {
  jobId: string;
  company: string;
};

// Fires the same /api/agent/research call the old manual button used —
// same feature flag, usage metering, and rate limit gates — just triggered
// on first mount (i.e. the first time the Company tab is opened) instead of
// waiting for a click. Only mounts while research is null; once it succeeds
// router.refresh() re-fetches the job with real data and this stops rendering.
export function AutoResearchCompany({ jobId, company }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(): void {
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/agent/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const json = (await res.json()) as {
          success: boolean;
          data?: { dossier: CompanyResearchDossier };
          error?: string;
        };

        if (!res.ok || !json.success) {
          setError(
            json.error ??
              "Company research could not be completed. Please try again.",
          );
          return;
        }

        router.refresh();
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  useEffect(() => {
    run();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <p className="max-w-xs text-xs text-error">{error}</p>
        <button
          type="button"
          disabled={isPending}
          onClick={run}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <RotateCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
      <Loader2 className="h-4 w-4 animate-spin" />
      Researching {company}...
    </div>
  );
}
