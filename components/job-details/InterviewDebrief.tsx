"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";

import { logInterviewEvent, type InterviewEventOutcome } from "@/actions/careerEvents";
import { INTERVIEW_OUTCOME_LABELS } from "@/lib/careerTimeline";

// A real capture form for interview_events — previously that table could
// only ever be written by the generic status-change note prompt
// (JobActionBar), never with a real "how did it actually go" debrief. Lives
// in the Interview Prep Room tab, next to InterviewPanel, since logging a
// debrief is naturally something you do right after an interview for THIS
// job. Supports logging more than once (multiple rounds), each a separate
// interview_events row.
export function InterviewDebrief({
  jobId,
  panelMembers,
}: {
  jobId: string;
  panelMembers: { id: string; name: string }[];
}) {
  const [outcome, setOutcome] = useState<InterviewEventOutcome>("pending");
  const [panelMemberId, setPanelMemberId] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [justLogged, setJustLogged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(): void {
    setError(null);
    startTransition(async () => {
      const result = await logInterviewEvent({
        jobId,
        panelMemberId: panelMemberId || null,
        outcome,
        notes: notes.trim() || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setNotes("");
      setPanelMemberId("");
      setOutcome("pending");
      setJustLogged(true);
      setTimeout(() => setJustLogged(false), 2500);
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <ClipboardCheck className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Log Interview Debrief</h2>
      </div>
      <p className="mb-4 text-sm text-text-secondary">
        How did it go? This becomes part of your real Application History and your private Career Record — never
        shared, never used to score you.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Outcome</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as InterviewEventOutcome)}
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
            >
              {Object.entries(INTERVIEW_OUTCOME_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {panelMembers.length > 0 && (
            <div className="min-w-40 flex-1">
              <label className="mb-1 block text-[11px] font-medium text-text-muted">Interviewer (optional)</label>
              <select
                value={panelMemberId}
                onChange={(e) => setPanelMemberId(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
              >
                <option value="">Not specified</option>
                {panelMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">What happened?</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="What was discussed, how you felt it went, anything worth remembering for next time..."
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
        </div>

        {error && <p className="text-xs text-error">{error}</p>}

        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="btn-signal inline-flex h-10 w-fit items-center gap-1.5 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {isPending ? "Logging..." : justLogged ? "Logged ✓" : "Log this debrief"}
        </button>
      </div>
    </section>
  );
}
