"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Users } from "lucide-react";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

type Props = {
  jobId: string;
};

export function LeadershipTeamButton({ jobId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/agent/research/leadership", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const json = (await res.json()) as { success: boolean; error?: string };

        if (!res.ok || !json.success) {
          setError(json.error ?? "Leadership lookup failed. Please try again.");
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
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
      >
        <Users className="h-4 w-4" />
        {isPending ? "Looking up leadership..." : "Find leadership team"}
      </button>
      {error && <p className="max-w-xs text-xs text-error">{error}</p>}
      {isPending && <AiThinkingCard className="w-full max-w-sm" status="Searching for public leadership info…" />}
    </div>
  );
}
