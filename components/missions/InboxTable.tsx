"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Archive, Bookmark, CheckCircle2, Search } from "lucide-react";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { bulkAddTag, bulkHideJobs, bulkShortlistJobs } from "@/actions/jobs";
import { getListingSignal } from "@/lib/jobStatus";
import { formatDate } from "@/lib/utils";
import type { Job } from "@/types";

// Inbox/Pipeline split (build-plan.md, `agy`-researched, direct user
// request) — every newly-found job now lands in "inbox" (see the
// add-inbox-shortlisted-stages migration), reviewed here as a dense,
// bulk-actionable table rather than full JobResultCard-per-row (which is
// what List view already does) or a Kanban column (the whole point of this
// split is keeping untriaged jobs OUT of the Kanban). Deliberately lighter
// weight than MissionsView's List/Board filter bar — this is a triage
// queue, not a place to slice-and-dice a large tracked pipeline, so it
// keeps its own small local search instead of sharing that state.
function scoreTierClass(score: number) {
  if (score >= 80) return "text-agent-dark";
  if (score >= 60) return "text-text-primary";
  return "text-text-muted";
}

export function InboxTable({ jobs }: { jobs: Job[] }) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [isPending, startTransition] = useTransition();

  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return jobs;
    return jobs.filter((job) => `${job.title ?? ""} ${job.company ?? ""}`.toLowerCase().includes(query));
  }, [jobs, search]);

  function toggleSelect(jobId: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  function toggleSelectAll(): void {
    setSelectedIds((prev) => (prev.size === visibleJobs.length ? new Set() : new Set(visibleJobs.map((j) => j.id))));
  }

  function clearSelection(): void {
    setSelectedIds(new Set());
    setShowTagInput(false);
    setTagInput("");
  }

  function handleShortlist(jobIds: string[]): void {
    startBulkAction(() => bulkShortlistJobs(jobIds));
  }

  function handleArchive(jobIds: string[]): void {
    startBulkAction(() => bulkHideJobs(jobIds));
  }

  function handleTag(): void {
    const tag = tagInput.trim();
    if (!tag || selectedIds.size === 0) return;
    startBulkAction(() => bulkAddTag(Array.from(selectedIds), tag));
  }

  function startBulkAction(action: () => Promise<unknown>): void {
    startTransition(async () => {
      await action();
      clearSelection();
    });
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium text-text-primary">Your Inbox is empty.</p>
        <p className="max-w-sm text-xs text-text-muted">
          New jobs you find land here first — review them and shortlist the ones you want to pursue into your real
          pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search inbox…"
            className="h-9 w-full rounded-full border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <p className="text-xs font-medium text-text-muted">
          {visibleJobs.length} job{visibleJobs.length === 1 ? "" : "s"} in your Inbox
          {/* Same 14-day framing as the auto-archive cron (lib/inngest/functions.ts) — a soft heads-up, not a countdown per job. */}
          {" · "}untouched ones auto-archive after 14 days
        </p>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-muted px-4 py-3">
          <span className="text-sm font-medium text-accent">{selectedIds.size} selected</span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleShortlist(Array.from(selectedIds))}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Bookmark className="h-3.5 w-3.5" />
            Shortlist selected
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleArchive(Array.from(selectedIds))}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Archive className="h-3.5 w-3.5" />
            Archive selected
          </button>
          {showTagInput ? (
            <div className="flex items-center gap-1.5">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag…"
                autoFocus
                className="h-8 w-32 rounded-full border border-border bg-surface px-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={isPending || !tagInput.trim()}
                onClick={handleTag}
                className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Tag
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowTagInput(true)}
              className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
            >
              Add tag…
            </button>
          )}
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={visibleJobs.length > 0 && selectedIds.size === visibleJobs.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-border accent-[var(--color-accent)]"
                />
              </th>
              <th className="px-2 py-2.5">Company / Role</th>
              <th className="px-2 py-2.5">Match</th>
              <th className="px-2 py-2.5">Found</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleJobs.map((job) => {
              const signal = getListingSignal(job);
              return (
                <tr key={job.id} className="border-b border-border/60 last:border-0 hover:bg-surface-secondary">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(job.id)}
                      onChange={() => toggleSelect(job.id)}
                      className="h-4 w-4 rounded border-border accent-[var(--color-accent)]"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <Link href={`/find-jobs/${job.id}`} className="flex min-w-0 items-center gap-2.5">
                      <CompanyLogo company={job.company} logoUrl={job.company_logo_url} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">{job.title ?? "Untitled role"}</p>
                        <p className="truncate text-xs text-text-muted">
                          {job.company ?? "Unknown company"}
                          {signal && <span className="ml-2 text-warning">{signal.label}</span>}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    {job.match_score !== null && job.match_score !== undefined ? (
                      <span className={`font-mono text-sm font-semibold tabular-nums ${scoreTierClass(job.match_score)}`}>
                        {job.match_score}%
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-xs text-text-muted">{formatDate(job.found_at)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleShortlist([job.id])}
                        title="Shortlist — move into your pipeline"
                        className="inline-flex h-7 items-center gap-1 rounded-full bg-accent-muted px-2.5 text-xs font-medium text-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Shortlist
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleArchive([job.id])}
                        title="Archive — not interested"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-tertiary hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
