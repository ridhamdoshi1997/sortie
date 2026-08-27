"use client";

import { useState, useTransition } from "react";
import { Archive, Tag, X } from "lucide-react";

import { JobResultCard } from "@/components/shared/JobResultCard";
import { bulkAddTag, bulkHideJobs } from "@/actions/jobs";
import { getListingSignal } from "@/lib/jobStatus";
import { computeReappearanceCounts, getReappearanceSignal } from "@/lib/churnSignal";
import type { Job } from "@/types";

type ReappearanceCounts = ReturnType<typeof computeReappearanceCounts>;

type Tab = "active" | "closed";

// Saved-job liveness status (build-plan.md §A) — sharper UI over the
// Phase 10 freshness-check logic (lib/jobStatus.ts's getListingSignal),
// which JobResultCard already renders as a per-card badge but nothing
// used to let a user filter BY it. A job is "Closed" if any real signal
// exists (user-confirmed unavailable, dropped from a repeat search, or
// just old) — same three-tier confidence order getListingSignal already
// encodes, just surfaced as a binary split here since that's the useful
// question at this level ("should I even look at this one"), not which
// specific signal fired.
export function SavedJobsTabs({ jobs, reappearanceCounts }: { jobs: Job[]; reappearanceCounts: ReappearanceCounts }) {
  const [tab, setTab] = useState<Tab>("active");
  // Bulk archive/tag (build-plan.md §H) — same select-mode/bulk-bar shape
  // already shipped on MissionsView's List/Board views and InboxTable, and
  // the same generic `bulkHideJobs`/`bulkAddTag` actions (scoped only by
  // user_id, not run/status), so this is a real re-application of a proven
  // pattern rather than a new one. No bulk-shortlist here — these jobs are
  // already saved, not sitting in the pre-pipeline Inbox that action targets.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [isBulkPending, startBulkTransition] = useTransition();

  const closedJobIds = new Set(jobs.filter((j) => getListingSignal(j) !== null).map((j) => j.id));
  const activeJobs = jobs.filter((j) => !closedJobIds.has(j.id));
  const closedJobs = jobs.filter((j) => closedJobIds.has(j.id));
  const visibleJobs = tab === "active" ? activeJobs : closedJobs;

  function toggleSelect(jobId: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function exitSelectMode(): void {
    setSelectMode(false);
    setSelectedIds(new Set());
    setTagInput("");
  }

  function handleBulkArchive(): void {
    const ids = Array.from(selectedIds);
    startBulkTransition(async () => {
      await bulkHideJobs(ids);
      exitSelectMode();
    });
  }

  function handleBulkTag(): void {
    const ids = Array.from(selectedIds);
    const tag = tagInput.trim();
    if (!tag) return;
    startBulkTransition(async () => {
      await bulkAddTag(ids, tag);
      exitSelectMode();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-full border border-border bg-surface-secondary p-1">
          <TabButton active={tab === "active"} onClick={() => setTab("active")} label="Active" count={activeJobs.length} />
          <TabButton active={tab === "closed"} onClick={() => setTab("closed")} label="Closed" count={closedJobs.length} />
        </div>
        <button
          type="button"
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            selectMode
              ? "bg-accent text-accent-foreground"
              : "border border-border bg-surface text-text-secondary hover:bg-surface-secondary"
          }`}
        >
          {selectMode ? "Cancel select" : "Select"}
        </button>
      </div>

      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-muted px-4 py-3">
          <span className="text-sm font-medium text-accent">{selectedIds.size} selected</span>
          <button
            type="button"
            disabled={selectedIds.size === 0 || isBulkPending}
            onClick={handleBulkArchive}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Archive className="h-3.5 w-3.5" />
            Archive selected
          </button>
          <div className="flex items-center gap-1.5">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add tag…"
              className="h-8 w-32 rounded-full border border-border bg-surface px-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              disabled={selectedIds.size === 0 || !tagInput.trim() || isBulkPending}
              onClick={handleBulkTag}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Tag className="h-3.5 w-3.5" />
              Tag selected
            </button>
          </div>
          <button
            type="button"
            onClick={exitSelectMode}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {visibleJobs.length === 0 ? (
        <p className="text-sm text-text-muted">
          {tab === "active" ? "No active saved jobs." : "No saved jobs flagged as closed — nice."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleJobs.map((job, index) => (
            <JobResultCard
              key={job.id}
              job={job}
              index={index}
              reappearanceSignal={getReappearanceSignal(job, reappearanceCounts)}
              selectable={selectMode}
              selected={selectedIds.has(job.id)}
              onToggleSelect={() => toggleSelect(job.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label} <span className="text-text-muted">({count})</span>
    </button>
  );
}
