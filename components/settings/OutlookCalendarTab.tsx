"use client";

import { useEffect, useState, useTransition } from "react";
import { Calendar, Unplug } from "lucide-react";

import { disconnectOutlook, findOutlookDetectedInterviews, getOutlookStatus } from "@/actions/outlookCalendar";

type Status = { connected: boolean; connectedAt?: string | null };

export function OutlookCalendarTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof findOutlookDetectedInterviews>>["matches"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getOutlookStatus().then(setStatus);
  }, []);

  function handleCheck(): void {
    setError(null);
    startTransition(async () => {
      const result = await findOutlookDetectedInterviews();
      if (!result.success) {
        setError(result.error ?? "Failed to check your calendar");
        return;
      }
      setMatches(result.matches ?? []);
    });
  }

  function handleDisconnect(): void {
    startTransition(async () => {
      const result = await disconnectOutlook();
      if (result.success) {
        setStatus({ connected: false });
        setMatches(null);
      }
    });
  }

  if (status === null) {
    return <p className="text-xs text-text-muted">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-text-primary">Outlook Calendar</h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Read-only access to your upcoming Outlook/Microsoft 365 events, used only to spot a real interview that
          matches a job you&apos;re tracking.
        </p>
      </div>

      {!status.connected ? (
        <a
          href="/api/auth/outlook-calendar/start"
          className="btn-signal inline-flex min-h-9 w-fit items-center gap-2 rounded-lg px-4 text-sm font-medium text-accent-foreground"
        >
          <Calendar className="h-4 w-4" />
          Connect Outlook Calendar
        </a>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <p className="text-sm text-text-primary">Connected</p>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={handleDisconnect}
              className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
              aria-label="Disconnect"
            >
              <Unplug className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            disabled={isPending}
            onClick={handleCheck}
            className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
          >
            {isPending ? "Checking…" : "Check for interview events"}
          </button>

          {matches && matches.length === 0 && (
            <p className="text-xs text-text-muted">No calendar events matched a tracked job in the next 14 days.</p>
          )}
          {matches && matches.length > 0 && (
            <div className="flex flex-col gap-2">
              {matches.map((m) => (
                <div key={`${m.jobId}-${m.eventSummary}`} className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
                  <p className="text-sm font-medium text-text-primary">{m.eventSummary}</p>
                  <p className="text-xs text-text-muted">
                    Matches {m.jobTitle} at {m.company}
                    {m.eventStart ? ` — ${new Date(m.eventStart).toLocaleString()}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
