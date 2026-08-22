"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileSearch } from "lucide-react";

import { GenerationProgress } from "@/components/ui/GenerationProgress";
import type { ResumeGapAnalysisResult } from "@/types";

type Props = {
  jobId: string;
};

const GENERATION_STAGES = [
  "Reading this job's requirements…",
  "Comparing against your resume, line by line…",
  "Scoring keyword coverage and gaps…",
];

export function AnalyzeResumeFitButton({ jobId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      try {
        const res = await fetch("/api/documents/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const json = (await res.json()) as {
          success: boolean;
          data?: ResumeGapAnalysisResult;
          error?: string;
        };

        if (!res.ok || !json.success) {
          setError(
            json.error ?? "Resume fit analysis could not be completed. Please try again.",
          );
          return;
        }

        setSuccess(true);
        router.refresh();
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  if (isPending) {
    return (
      <div className="w-full max-w-sm">
        <GenerationProgress title="Resume fit check" stages={GENERATION_STAGES} timeEstimate="Usually takes 5–10 seconds" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <FileSearch className="h-4 w-4" />
        Check Resume Fit
      </button>
      {error && <p className="max-w-xs text-xs text-error">{error}</p>}
      {success && (
        <p className="max-w-xs text-xs text-success">
          Analysis saved. Refreshing details...
        </p>
      )}
    </div>
  );
}
