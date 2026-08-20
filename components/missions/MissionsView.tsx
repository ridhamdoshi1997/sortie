"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Archive, LayoutGrid, List, Tag, X } from "lucide-react";

import { KanbanBoardLoader } from "@/components/missions/KanbanBoardLoader";
import { MissionsFilterBar, type SortValue } from "@/components/missions/MissionsFilterBar";
import { JobResultCard } from "@/components/shared/JobResultCard";
import { bulkAddTag, bulkHideJobs } from "@/actions/jobs";
import { STAGE_ORDER, STATUS_LABELS, type ApplicationStatus } from "@/lib/applicationStatus";
import { computeReappearanceCounts, getReappearanceSignal } from "@/lib/churnSignal";
import { getListingSignal } from "@/lib/jobStatus";
import { SOURCE_FILTER_OPTIONS } from "@/lib/jobSource";
import type { Job } from "@/types";

type ViewMode = "kanban" | "list";
type FilterValue = "all" | ApplicationStatus;

// Google Jobs' own raw location text sometimes tags a multi-location
// posting with a "(+N other/others)" suffix (e.g. "Toronto, ON (+1 other)")
// — same city, same underlying job, just a different literal string than a
// single-location "Toronto, ON" posting. Left ungrouped, the location
// filter showed these as separate options for what a user experiences as
// one city — grouped here by stripping the suffix before dedup/matching.
const LOCATION_SUFFIX_PATTERN = /\s*\(\+\d+\s+others?\)\s*$/i;

function normalizeLocationForFilter(location: string): string {
  return location.replace(LOCATION_SUFFIX_PATTERN, "").trim();
}

// "Group by company" (build-plan.md §38 parity) — groups, doesn't re-sort;
// preserves whatever order `jobs` already arrived in within each group, so
// combining this with any sort mode (recently found, highest match, etc.)
// still reads as intended inside each company's cluster.
function groupJobsByCompany(jobs: Job[]): Record<string, Job[]> {
  const groups: Record<string, Job[]> = {};
  for (const job of jobs) {
    const company = job.company ?? "Unknown company";
    (groups[company] ??= []).push(job);
  }
  return groups;
}

// Renamed from "Pipeline" (2026-08-12) — researched via agy for a name
// fitting the app's aviation/precision-targeting metaphor ("Sortie" = one
// mission flight); "Missions" was picked over "Radar"/"Ops"/"Flight Deck"
// since it maps 1:1 to what this page actually tracks (each application
// you're pursuing is a mission moving through stages), not just a vibe.
//
// Also researched via agy before building the Board/List toggle itself:
// real trackers (Teal, Huntr) don't fragment the pipeline into separate
// pages per stage; they use one unified Tracker view with a Kanban/list
// toggle and status filtering instead. This component IS that toggle.
export function MissionsView({
  jobs,
  appliedAtByJobId = {},
}: {
  jobs: Job[];
  appliedAtByJobId?: Record<string, string>;
}) {
  // Dashboard Pipeline Funnel (build-plan.md §P) links here as
  // `/missions?stage=applied` etc. — read once on mount as the initial
  // filter/view so a funnel-segment click lands directly on the matching
  // filtered List, not the default unfiltered Board ("no dead ends" rule
  // from the dashboard redesign research). Only ever used as an initial
  // value, same idiom as FindJobsForm.tsx's own searchParams-seeded state.
  const searchParams = useSearchParams();
  const stageParam = searchParams.get("stage") as FilterValue | null;
  const [viewMode, setViewMode] = useState<ViewMode>(stageParam ? "list" : "kanban");
  const [filter, setFilter] = useState<FilterValue>(stageParam && STAGE_ORDER.includes(stageParam as ApplicationStatus) ? stageParam : "all");
  // Location/search/remote filters narrow which jobs show in EITHER view
  // (unlike the stage filter above, which only makes sense in List — Kanban
  // already groups by stage as its own columns). User-requested: applying to
  // different-location roles at once meant no way to isolate one location
  // on this page before this.
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  // Kanban filter-bar research (agy, 2026-08-17) — a minimum match-score
  // threshold and a "needs attention" toggle (reuses lib/jobStatus.ts's
  // existing getListingSignal, no new staleness logic) plus a sort control,
  // all per direct user follow-up request after the location filter shipped.
  const [minMatchScore, setMinMatchScore] = useState<number | null>(null);
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortValue>("found");
  // "Group by company" (build-plan.md §38 parity) — List-view-only, same as
  // the stage filter pills above (Kanban already groups by status via its
  // own columns, a second grouping concept there would fight the first).
  const [groupByCompany, setGroupByCompany] = useState(false);
  // Bulk actions (build-plan.md §H) — List-view-only, same reasoning as
  // groupByCompany above. Selection is a plain Set of job ids, cleared on
  // exiting select mode or after a bulk action commits.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [isBulkPending, startBulkTransition] = useTransition();

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
  // "" = all sources. Values match jobs.source directly (see lib/jobSource.ts)
  // — lets a user isolate extension-captured jobs (LinkedIn/Indeed) from the
  // default scraped majority, or from a manual paste, directly on this page.
  const [sourceFilter, setSourceFilter] = useState("");

  const availableSources = useMemo(() => {
    const present = new Set<string>(jobs.map((job) => job.source));
    return SOURCE_FILTER_OPTIONS.filter((option) => present.has(option.value));
  }, [jobs]);

  const locations = useMemo(() => {
    const unique = new Set(
      jobs
        .map((job) => job.location)
        .filter((value): value is string => Boolean(value))
        .map(normalizeLocationForFilter)
        .filter(Boolean),
    );
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = jobs.filter((job) => {
      if (query) {
        const haystack = `${job.title ?? ""} ${job.company ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (location && normalizeLocationForFilter(job.location ?? "") !== location) return false;
      // Same isRemote idiom already used on the job-details page/JobActionBar
      // — no structured work-mode field exists in the source data, so this
      // is a best-effort text match against title/location, not a claim of
      // precision this app doesn't have.
      if (remoteOnly && !/\bremote\b/i.test(`${job.title ?? ""} ${job.location ?? ""}`)) return false;
      if (minMatchScore !== null && (job.match_score ?? 0) < minMatchScore) return false;
      if (needsAttentionOnly && !getListingSignal(job)) return false;
      if (sourceFilter && job.source !== sourceFilter) return false;
      return true;
    });

    // Sort is separate from the filter pass above — it applies to whichever
    // jobs already passed every filter, not a replacement for them.
    const sorted = [...matched];
    if (sortBy === "match") {
      sorted.sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0));
    } else if (sortBy === "company") {
      sorted.sort((a, b) => (a.company ?? "").localeCompare(b.company ?? ""));
    } else if (sortBy === "stage") {
      // Oldest stage-update first — the jobs that have gone quietest sort to
      // the top, since those are the ones most likely to need a nudge.
      sorted.sort(
        (a, b) =>
          new Date(a.application_status_updated_at ?? a.found_at).getTime() -
          new Date(b.application_status_updated_at ?? b.found_at).getTime(),
      );
    } else {
      sorted.sort((a, b) => new Date(b.found_at).getTime() - new Date(a.found_at).getTime());
    }
    return sorted;
  }, [jobs, search, location, remoteOnly, minMatchScore, needsAttentionOnly, sortBy, sourceFilter]);

  const reappearanceCounts = computeReappearanceCounts(visibleJobs);
  const filteredJobs = filter === "all" ? visibleJobs : visibleJobs.filter((job) => job.application_status === filter);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "kanban" ? "bg-accent text-accent-foreground" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Board
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "list" ? "bg-accent text-accent-foreground" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <List className="h-4 w-4" />
            List
          </button>
        </div>

        <MissionsFilterBar
          search={search}
          onSearchChange={setSearch}
          location={location}
          onLocationChange={setLocation}
          locations={locations}
          remoteOnly={remoteOnly}
          onRemoteOnlyChange={setRemoteOnly}
          minMatchScore={minMatchScore}
          onMinMatchScoreChange={setMinMatchScore}
          needsAttentionOnly={needsAttentionOnly}
          onNeedsAttentionOnlyChange={setNeedsAttentionOnly}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          availableSources={availableSources}
        />

        {viewMode === "list" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterPill label="All" active={filter === "all"} onClick={() => setFilter("all")} />
            {STAGE_ORDER.map((stage) => (
              <FilterPill
                key={stage}
                label={STATUS_LABELS[stage]}
                active={filter === stage}
                onClick={() => setFilter(stage)}
              />
            ))}
            <button
              type="button"
              onClick={() => setGroupByCompany((v) => !v)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                groupByCompany
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-surface text-text-secondary hover:bg-surface-secondary"
              }`}
            >
              Group by company
            </button>
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
        )}
      </div>

      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-muted px-4 py-3">
          <span className="text-sm font-medium text-accent">
            {selectedIds.size} selected
          </span>
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

      {viewMode === "kanban" ? (
        // Keyed on the active filter combo — KanbanBoard seeds its own
        // internal drag state from `jobs` via a lazy useState initializer
        // that only ever runs once (deliberate, so a completed drag's
        // optimistic column move doesn't get clobbered by the next
        // server-revalidated `jobs` prop). That means it never re-derives
        // columns if `jobs` changes shape after mount — a filter change
        // needs a fresh mount, not a prop update, to actually take effect.
        <KanbanBoardLoader
          key={`${search}|${location}|${remoteOnly}|${minMatchScore}|${needsAttentionOnly}|${sortBy}|${sourceFilter}`}
          jobs={visibleJobs}
          appliedAtByJobId={appliedAtByJobId}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredJobs.length === 0 ? (
            <p className="text-sm text-text-muted">No jobs match these filters.</p>
          ) : groupByCompany ? (
            (() => {
              let cardIndex = 0;
              return Object.entries(groupJobsByCompany(filteredJobs)).map(([company, companyJobs]) => (
                <div key={company} className="flex flex-col gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {company} ({companyJobs.length})
                  </h3>
                  {companyJobs.map((job) => (
                    <JobResultCard
                      key={job.id}
                      job={job}
                      index={cardIndex++}
                      reappearanceSignal={getReappearanceSignal(job, reappearanceCounts)}
                      selectable={selectMode}
                      selected={selectedIds.has(job.id)}
                      onToggleSelect={() => toggleSelect(job.id)}
                    />
                  ))}
                </div>
              ));
            })()
          ) : (
            filteredJobs.map((job, index) => (
              <JobResultCard
                key={job.id}
                job={job}
                index={index}
                reappearanceSignal={getReappearanceSignal(job, reappearanceCounts)}
                selectable={selectMode}
                selected={selectedIds.has(job.id)}
                onToggleSelect={() => toggleSelect(job.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "border border-border bg-surface text-text-secondary hover:bg-surface-secondary"
      }`}
    >
      {label}
    </button>
  );
}
