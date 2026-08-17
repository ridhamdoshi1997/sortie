"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowLeft, Bookmark, ChevronDown, Eye, EyeOff, ExternalLink, Repeat } from "lucide-react";

import { markJobUnavailable, setApplicationStatus, toggleHideJob, toggleSaveJob, unmarkJobUnavailable } from "@/actions/jobs";
import { getListingSignal } from "@/lib/jobStatus";
import { STAGE_ORDER, STATUS_CLASSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/applicationStatus";
import type { ReappearanceSignal } from "@/lib/churnSignal";
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
  reappearanceSignal?: ReappearanceSignal;
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
  reappearanceSignal = null,
}: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [hidden, setHidden] = useState(initialHidden);
  const [status, setStatus] = useState<ApplicationStatus>(initialApplicationStatus ?? "draft");
  // Fixed/portaled, not a plain absolute-positioned child — this page always
  // has more content below the action bar (JobInfo, tabs, etc.), and a
  // same-stacking-context absolute dropdown painted underneath that content
  // instead of over it (confirmed live). Same fix already proven for
  // StyleTab.tsx's Theme/Page-size dropdowns: portal to document.body,
  // position:fixed computed from the trigger's real getBoundingClientRect(),
  // close on scroll since a fixed panel doesn't track its trigger.
  const [statusMenuPosition, setStatusMenuPosition] = useState<{ top: number; left: number } | null>(null);
  // §Q1 "log outcome" step — a status landing on a real application_events
  // type (not "draft", which is a correction rather than an outcome) opens
  // a one-field optional/skippable note prompt instead of applying
  // immediately, per build-plan.md §Q1's UX spec. Same portal/position
  // idiom as statusMenuPosition, just a second panel keyed off its own state
  // so the two never fight over one position value.
  const [notePrompt, setNotePrompt] = useState<{ position: { top: number; left: number }; next: ApplicationStatus } | null>(null);
  const [markedUnavailableAt, setMarkedUnavailableAt] = useState(initialMarkedUnavailableAt ?? null);
  const [isPending, startTransition] = useTransition();
  // formatTimeAgo(foundAt) is time-dependent — computing it inline in JSX
  // renders a different string at SSR-time than at client-hydration-time
  // whenever real wall-clock time crosses a bucket boundary between those
  // two moments (confirmed live: a slow page load, e.g. this page's own
  // 24s "Get strategic briefing" round trip, is more than enough for
  // "just now" to become "1 min ago"). Deferring to client-only via
  // useEffect means SSR and initial hydration both render nothing for this
  // span, so there's nothing for React to mismatch on — the real value
  // fills in a tick after mount instead.
  const [foundAtLabel, setFoundAtLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!foundAt) return;
    const timer = setTimeout(() => setFoundAtLabel(formatTimeAgo(foundAt)), 0);
    return () => clearTimeout(timer);
  }, [foundAt]);
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

  function commitStatusChange(next: ApplicationStatus, note?: string): void {
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await setApplicationStatus(jobId, previous, next, note);
      if (!result.success) setStatus(previous);
    });
  }

  // Statuses with a real application_events counterpart (see
  // actions/jobs.ts's APPLICATION_EVENT_TYPE_BY_STATUS) get the note prompt;
  // "draft" has no matching event type — going back to draft is a
  // correction, not an outcome — so it applies immediately, same as before.
  function handleChooseStatus(next: ApplicationStatus): void {
    const position = statusMenuPosition;
    setStatusMenuPosition(null);
    if (next === status) return;
    if (next === "draft" || !position) {
      commitStatusChange(next);
      return;
    }
    setNotePrompt({ position, next });
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
        {foundAtLabel && (
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-muted">
            Found {foundAtLabel}
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
        {reappearanceSignal && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning">
            <Repeat className="h-3.5 w-3.5" />
            {reappearanceSignal.label}
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

        <div>
          <button
            type="button"
            disabled={isPending}
            onClick={(e) => {
              if (statusMenuPosition) {
                setStatusMenuPosition(null);
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              setStatusMenuPosition({ top: rect.bottom + 4, left: rect.left });
            }}
            aria-expanded={statusMenuPosition !== null}
            className={`glass-pill inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${STATUS_CLASSES[status]}`}
          >
            {STATUS_LABELS[status]}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {statusMenuPosition && (
            <StatusMenuPanel
              position={statusMenuPosition}
              status={status}
              onSelect={handleChooseStatus}
              onClose={() => setStatusMenuPosition(null)}
            />
          )}

          {notePrompt && (
            <NotePromptPanel
              position={notePrompt.position}
              nextStatus={notePrompt.next}
              onSkip={() => {
                commitStatusChange(notePrompt.next);
                setNotePrompt(null);
              }}
              onLog={(note) => {
                commitStatusChange(notePrompt.next, note);
                setNotePrompt(null);
              }}
              onClose={() => {
                // Dismissing without an explicit choice still counts as
                // "skip" — the status change itself isn't optional, only
                // the note is, so clicking away can't silently discard the
                // status transition the user already picked.
                commitStatusChange(notePrompt.next);
                setNotePrompt(null);
              }}
            />
          )}
        </div>

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

// Same portal/fixed-position pattern as StyleTab.tsx's DropdownPanel — see
// the statusMenuPosition state comment above for why a plain absolute
// child isn't enough on this particular page.
function StatusMenuPanel({
  position,
  status,
  onSelect,
  onClose,
}: {
  position: { top: number; left: number };
  status: ApplicationStatus;
  onSelect: (stage: ApplicationStatus) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("scroll", onClose, true);
    return () => window.removeEventListener("scroll", onClose, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: position.top, left: position.left }}
      className="glass-panel-strong animate-in fade-in-0 zoom-in-95 z-50 w-44 rounded-xl p-1.5 duration-150"
    >
      {STAGE_ORDER.map((stage) => (
        <button
          key={stage}
          type="button"
          onClick={() => onSelect(stage)}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-secondary ${
            stage === status ? "text-text-primary" : "text-text-secondary"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${STATUS_CLASSES[stage].split(" ")[0]}`} />
          {STATUS_LABELS[stage]}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// §Q1's "log outcome" step — one optional, skippable note attached to the
// application_events row this status change already writes (see
// actions/jobs.ts's setApplicationStatus). Same portal/fixed-position idiom
// as StatusMenuPanel, rendered in its place once a real-event status is
// chosen.
function NotePromptPanel({
  position,
  nextStatus,
  onSkip,
  onLog,
  onClose,
}: {
  position: { top: number; left: number };
  nextStatus: ApplicationStatus;
  onSkip: () => void;
  onLog: (note: string) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("scroll", onClose, true);
    return () => window.removeEventListener("scroll", onClose, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: position.top, left: position.left }}
      className="glass-panel-strong animate-in fade-in-0 zoom-in-95 z-50 w-72 rounded-xl p-3 duration-150"
    >
      <p className="mb-2 text-sm font-medium text-text-primary">
        Marked as {STATUS_LABELS[nextStatus]} — add a note?
      </p>
      <textarea
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional — what happened? (skippable)"
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          Skip
        </button>
        <button
          type="button"
          disabled={!note.trim()}
          onClick={() => onLog(note.trim())}
          className="rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Log note
        </button>
      </div>
    </div>,
    document.body,
  );
}
