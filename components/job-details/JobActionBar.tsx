"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Bookmark, Check, Eye, EyeOff, ExternalLink } from "lucide-react";

import { markApplied, toggleHideJob, toggleSaveJob } from "@/actions/jobs";

type Props = {
  jobId: string;
  applyUrl: string | null;
  company: string;
  initialSaved: boolean;
  initialHidden: boolean;
  initialApplicationStatus?: string;
  postedAt?: string | null;
  isRemote?: boolean;
};

export function JobActionBar({
  jobId,
  applyUrl,
  company,
  initialSaved,
  initialHidden,
  initialApplicationStatus,
  postedAt,
  isRemote,
}: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [hidden, setHidden] = useState(initialHidden);
  const [applied, setApplied] = useState(initialApplicationStatus === "applied");
  const [isPending, startTransition] = useTransition();

  function handleMarkApplied(): void {
    if (applied) return;
    setApplied(true);
    startTransition(async () => {
      const result = await markApplied(jobId);
      if (!result.success) setApplied(false);
    });
  }

  function handleSave(): void {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleSaveJob(jobId, next);
      if (!result.success) setSaved(!next);
    });
  }

  function handleHide(): void {
    const next = !hidden;
    setHidden(next);
    startTransition(async () => {
      const result = await toggleHideJob(jobId, next);
      if (!result.success) setHidden(!next);
    });
  }

  return (
    // No longer sticky (2026-07-27) — with the main Navbar now its own
    // floating/sticky bar, stacking a second sticky bar directly under it
    // read as one too many pinned elements competing for the same space
    // (and needed its own top offset kept in sync with Navbar's height,
    // which is exactly the kind of dependency that broke once already).
    // This is a plain in-flow bar now; Save/Hide/Apply just aren't
    // reachable without scrolling back up, same as any other section.
    <div className="glass-panel-strong flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
      <Link
        href="/find-jobs"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Jobs
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        {postedAt && (
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-muted">
            Posted {postedAt}
          </span>
        )}
        {isRemote && (
          <span className="rounded-full bg-info-lightest px-3 py-1 text-xs font-medium text-info">
            Remote
          </span>
        )}
        {hidden && (
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-muted">
            Hidden from your list
          </span>
        )}

        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className={`glass-pill inline-flex min-h-9 items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
            saved ? "text-accent" : "text-text-secondary"
          }`}
        >
          <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
          {saved ? "Saved" : "Save"}
        </button>

        <button
          type="button"
          disabled={isPending}
          onClick={handleHide}
          className="glass-pill inline-flex min-h-9 items-center gap-2 px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors disabled:opacity-60"
        >
          {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {hidden ? "Unhide" : "Hide"}
        </button>

        <button
          type="button"
          disabled={isPending || applied}
          onClick={handleMarkApplied}
          className={`glass-pill inline-flex min-h-9 items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-100 ${
            applied ? "text-success" : "text-text-secondary"
          }`}
        >
          <Check className="h-4 w-4" />
          {applied ? "Applied" : "Mark as applied"}
        </button>

        {applyUrl ? (
          <Link
            href={applyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Apply at {company}
            <ExternalLink className="h-4 w-4" />
          </Link>
        ) : (
          <div
            className="glass-pill inline-flex min-h-9 cursor-not-allowed items-center gap-2 px-4 py-1.5 text-sm font-medium text-text-muted"
            title="No application link was saved for this job"
          >
            No link available
          </div>
        )}
      </div>
    </div>
  );
}
