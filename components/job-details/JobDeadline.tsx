"use client";

import { useState, useTransition } from "react";
import { CalendarClock, X } from "lucide-react";

import { setJobDeadline } from "@/actions/jobs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// A real, user-entered future timestamp — deliberately separate from
// interview_events (a log of what already happened, not a schedule of
// what's coming). One slot per job, matching marked_unavailable_at's
// single-column shape rather than a full events table — the "deadline
// tracker" this powers only needs "what's the next thing coming up for this
// job", not a full history of past deadlines.

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function JobDeadline({
  jobId,
  initialDeadlineAt,
  initialLabel,
}: {
  jobId: string;
  initialDeadlineAt: string | null;
  initialLabel: string | null;
}) {
  const [deadlineAt, setDeadlineAt] = useState(toDatetimeLocalValue(initialDeadlineAt));
  const [label, setLabel] = useState(initialLabel ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    deadlineAt !== toDatetimeLocalValue(initialDeadlineAt) || label !== (initialLabel ?? "");

  function handleSave(): void {
    setError(null);
    // datetime-local has no timezone — interpreted in the browser's own
    // local time, same as the user picked it, then serialized to a real
    // UTC instant for storage (matches how every other timestamp column in
    // this app is stored).
    const isoValue = deadlineAt ? new Date(deadlineAt).toISOString() : null;
    startTransition(async () => {
      const result = await setJobDeadline(jobId, isoValue, label || null);
      if (!result.success) setError(result.error ?? "Failed to save the deadline");
    });
  }

  function handleClear(): void {
    setDeadlineAt("");
    setLabel("");
    setError(null);
    startTransition(async () => {
      const result = await setJobDeadline(jobId, null, null);
      if (!result.success) setError(result.error ?? "Failed to clear the deadline");
    });
  }

  return (
    // Pane inside the shared Tracking card (app/find-jobs/[id]/page.tsx) —
    // professional-polish pass, 2026-08-25: this and its three siblings
    // (ApplicationHistory/JobTagsAndNotes/WhyILeftReflection) used to each
    // open their own `border shadow-card` box with an icon-chip header —
    // four identical boxes stacked, the same "lazy container" scaffold
    // fixed on "The Role" section earlier this pass. Now four panes inside
    // one shared card with a hairline divider between them (`first:border-
    // t-0` drops the divider on whichever pane actually renders first,
    // since ApplicationHistory/WhyILeftReflection are both conditional).
    <div className="border-t border-border-light px-6 py-6 first:border-t-0">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <CalendarClock className="h-3.5 w-3.5" />
        Next deadline
      </h3>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">What</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Final interview, Application closes"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">When</label>
          <Input
            type="datetime-local"
            value={deadlineAt}
            onChange={(e) => setDeadlineAt(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!hasChanges || isPending || (!deadlineAt && !label)}
            onClick={handleSave}
          >
            Save
          </Button>
          {initialDeadlineAt && (
            <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={handleClear}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </div>
  );
}
