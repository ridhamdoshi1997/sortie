"use client";

import { useState, useTransition } from "react";
import { HeartCrack } from "lucide-react";

import { updateJobReflection } from "@/actions/jobs";

// "Why I Left" private log (build-plan.md §E) — a private, structured
// reflection, distinct from JobTagsAndNotes' generic free-text note. Shown
// only once a job is marked rejected (the app's one real "this job search
// ended" state) — the whole point is capturing the reflection while it's
// still fresh, not asking for it upfront when there's nothing to reflect
// on yet. Same blur-to-save pattern as JobTagsAndNotes.
export function WhyILeftReflection({
  jobId,
  initialLoved,
  initialAvoid,
}: {
  jobId: string;
  initialLoved: string | null;
  initialAvoid: string | null;
}) {
  const [loved, setLoved] = useState(initialLoved ?? "");
  const [avoid, setAvoid] = useState(initialAvoid ?? "");
  const [saved, setSaved] = useState(true);
  const [, startTransition] = useTransition();

  function handleBlur(): void {
    if (loved === (initialLoved ?? "") && avoid === (initialAvoid ?? "")) return;
    startTransition(async () => {
      await updateJobReflection(jobId, loved, avoid);
      setSaved(true);
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <HeartCrack className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Why this ended</h2>
      </div>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        Private — just for you, for the next time you&apos;re evaluating something similar.
      </p>

      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">What you liked about it</label>
          <textarea
            value={loved}
            onChange={(e) => {
              setLoved(e.target.value);
              setSaved(false);
            }}
            onBlur={handleBlur}
            rows={2}
            placeholder="The team, the mission, the comp, the stack..."
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">What you&apos;d avoid next time</label>
          <textarea
            value={avoid}
            onChange={(e) => {
              setAvoid(e.target.value);
              setSaved(false);
            }}
            onBlur={handleBlur}
            rows={2}
            placeholder="A red flag, a mismatch, something that never sat right..."
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
        </div>
        {!saved && <p className="text-[11px] text-text-muted">Saves when you click away</p>}
      </div>
    </section>
  );
}
