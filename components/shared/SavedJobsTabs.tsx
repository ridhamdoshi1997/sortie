"use client";

import { useState } from "react";

import { JobResultCard } from "@/components/shared/JobResultCard";
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

  const closedJobIds = new Set(jobs.filter((j) => getListingSignal(j) !== null).map((j) => j.id));
  const activeJobs = jobs.filter((j) => !closedJobIds.has(j.id));
  const closedJobs = jobs.filter((j) => closedJobIds.has(j.id));
  const visibleJobs = tab === "active" ? activeJobs : closedJobs;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit gap-1 rounded-full border border-border bg-surface-secondary p-1">
        <TabButton active={tab === "active"} onClick={() => setTab("active")} label="Active" count={activeJobs.length} />
        <TabButton active={tab === "closed"} onClick={() => setTab("closed")} label="Closed" count={closedJobs.length} />
      </div>

      {visibleJobs.length === 0 ? (
        <p className="text-sm text-text-muted">
          {tab === "active" ? "No active saved jobs." : "No saved jobs flagged as closed — nice."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {visibleJobs.map((job, index) => (
            <JobResultCard key={job.id} job={job} index={index} reappearanceSignal={getReappearanceSignal(job, reappearanceCounts)} />
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
