"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";

import { migrateBaseResumeToSlot } from "@/actions/resumes";

// Prompts to fold the legacy single-résumé upload (profiles.resume_pdf_url,
// from before this multi-slot system existed) into a real `resumes` row —
// a one-click, explicit action rather than something that runs on its own.
// See migrateBaseResumeToSlot()'s comment in actions/resumes.ts for why this
// must stay a deliberate click: an earlier version did this automatically on
// every page load and raced itself into 96 duplicate rows.
export function MigrateBaseResumeCard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await migrateBaseResumeToSlot();
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error ?? "Failed to add this résumé to your slots");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-surface-secondary/40 p-4">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-medium text-text-primary">
            You have a résumé on file from before résumé slots existed.
          </p>
          <p className="text-xs text-text-muted">Add it as a slot to make it primary, sync, or export.</p>
          {error && <p className="mt-1 text-xs text-error">{error}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={pending}
        className="btn-signal inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
      >
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {pending ? "Adding…" : "Add to résumé slots"}
      </button>
    </div>
  );
}
