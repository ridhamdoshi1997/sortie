"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Users } from "lucide-react";

type Props = {
  jobId: string;
};

export function InsiderConnectionsButton({ jobId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/agent/research/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const json = (await res.json()) as { success: boolean; error?: string };

        if (!res.ok || !json.success) {
          setError(json.error ?? "Connections lookup failed. Please try again.");
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
        <Users className="h-4 w-4" />
        {isPending ? "Finding connections..." : "Find Connections"}
      </button>
      {error && <p className="max-w-xs text-xs text-error">{error}</p>}
    </div>
  );
}
