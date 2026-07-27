"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Bookmark, Eye, EyeOff, ExternalLink } from "lucide-react";

import { toggleHideJob, toggleSaveJob } from "@/actions/jobs";

type Props = {
  jobId: string;
  applyUrl: string | null;
  company: string;
  initialSaved: boolean;
  initialHidden: boolean;
  postedAt?: string | null;
  isRemote?: boolean;
};

export function JobActionBar({
  jobId,
  applyUrl,
  company,
  initialSaved,
  initialHidden,
  postedAt,
  isRemote,
}: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [hidden, setHidden] = useState(initialHidden);
  const [isPending, startTransition] = useTransition();

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
    <div className="glass-panel-strong sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
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

        {applyUrl ? (
          <Link
            href={applyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-glass-highlight)_35%,transparent)] transition-opacity hover:opacity-90"
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
