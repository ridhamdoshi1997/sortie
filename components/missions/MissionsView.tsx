"use client";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";

import { KanbanBoardLoader } from "@/components/missions/KanbanBoardLoader";
import { JobResultCard } from "@/components/shared/JobResultCard";
import { STAGE_ORDER, STATUS_LABELS, type ApplicationStatus } from "@/lib/applicationStatus";
import { computeReappearanceCounts, getReappearanceSignal } from "@/lib/churnSignal";
import type { Job } from "@/types";

type ViewMode = "kanban" | "list";
type FilterValue = "all" | ApplicationStatus;

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
export function MissionsView({ jobs }: { jobs: Job[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [filter, setFilter] = useState<FilterValue>("all");

  const reappearanceCounts = computeReappearanceCounts(jobs);
  const filteredJobs = filter === "all" ? jobs : jobs.filter((job) => job.application_status === filter);

  return (
    <div className="flex flex-col gap-4">
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
          </div>
        )}
      </div>

      {viewMode === "kanban" ? (
        <KanbanBoardLoader jobs={jobs} />
      ) : (
        <div className="flex flex-col gap-4">
          {filteredJobs.length === 0 ? (
            <p className="text-sm text-text-muted">No jobs in this stage yet.</p>
          ) : (
            filteredJobs.map((job, index) => (
              <JobResultCard
                key={job.id}
                job={job}
                index={index}
                reappearanceSignal={getReappearanceSignal(job, reappearanceCounts)}
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
