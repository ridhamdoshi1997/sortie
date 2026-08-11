"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, Bookmark, Check, Eye, EyeOff, ExternalLink } from "lucide-react";

import { markJobUnavailable, setApplicationStatus, toggleHideJob, toggleSaveJob, unmarkJobUnavailable } from "@/actions/jobs";
import { getListingSignal } from "@/lib/jobStatus";
import type { ApplicationStatus } from "@/lib/applicationStatus";
import { formatTimeAgo } from "@/lib/utils";

type Props = {
  jobId: string;
  applyUrl: string | null;
  company: string;
  initialSaved: boolean;
  initialHidden: boolean;
  initialApplicationStatus?: ApplicationStatus;
  foundAt?: string | null;
  isRemote?: boolean;
  initialMarkedUnavailableAt?: string | null;
  droppedFromSearchAt?: string | null;
};

export function JobActionBar({
  jobId,
  applyUrl,
  company,
  initialSaved,
  initialHidden,
  initialApplicationStatus,
  foundAt,
  isRemote,
  initialMarkedUnavailableAt,
  droppedFromSearchAt,
}: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [hidden, setHidden] = useState(initialHidden);
  const [applied, setApplied] = useState(initialApplicationStatus === "applied");
  const [markedUnavailableAt, setMarkedUnavailableAt] = useState(initialMarkedUnavailableAt ?? null);
  const [isPending, startTransition] = useTransition();
  const signal = getListingSignal({
    marked_unavailable_at: markedUnavailableAt,
    dropped_from_search_at: droppedFromSearchAt ?? null,
    found_at: foundAt ?? null,
  });

  function handleToggleUnavailable(): void {
    const wasMarked = Boolean(markedUnavailableAt);
    const nowIso = new Date().toISOString();
    setMarkedUnavailableAt(wasMarked ? null : nowIso);
    startTransition(async () => {
      const result = wasMarked ? await unmarkJobUnavailable(jobId) : await markJobUnavailable(jobId);
      if (!result.success) setMarkedUnavailableAt(wasMarked ? nowIso : null);
    });
  }

  function handleMarkApplied(): void {
    if (applied) return;
    setApplied(true);
    startTransition(async () => {
      const result = await setApplicationStatus(jobId, initialApplicationStatus ?? "draft", "applied");
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
        {/* Not `job.posted_at` — that's Google Jobs' own relative text
            ("2 days ago") frozen at scrape time, never refreshed, so it
            would read as permanently fresh no matter how old the listing
            actually gets (confirmed live — a real listing found weeks ago
            still showed "Posted 2 days ago"). `foundAt` is a real DB
            timestamp, safe to compute a live relative time from. */}
        {foundAt && (
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-muted">
            Found {formatTimeAgo(foundAt)}
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
        {signal && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              signal.level === "confirmed"
                ? "bg-warning text-warning-foreground"
                : signal.level === "likely"
                  ? "bg-warning/15 text-warning"
                  : "bg-surface-secondary text-text-muted"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {signal.label}
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

        <button
          type="button"
          disabled={isPending}
          onClick={handleToggleUnavailable}
          className={`glass-pill inline-flex min-h-9 items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
            markedUnavailableAt ? "text-warning" : "text-text-secondary"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          {markedUnavailableAt ? "Available again?" : "Mark unavailable"}
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
