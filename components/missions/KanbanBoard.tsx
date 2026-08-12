"use client";

import { useState } from "react";
import { DndContext, type DragEndEvent, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { setApplicationStatus } from "@/actions/jobs";
import { STAGE_ORDER, STATUS_CLASSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/applicationStatus";
import { KanbanCard, type KanbanJob } from "@/components/missions/KanbanCard";

// The first real cross-column @dnd-kit board in this codebase — every prior
// use (components/documents/EditorTab.tsx's SortableList) is a single-list
// arrayMove reorder. Multi-container drag needs its own DndContext at the
// board level plus a useDroppable per column so an empty column is still a
// valid drop target, not just the SortableContext-managed cards inside it.

type ColumnsState = Record<ApplicationStatus, KanbanJob[]>;

function groupByStatus(jobs: KanbanJob[]): ColumnsState {
  const grouped = Object.fromEntries(STAGE_ORDER.map((status) => [status, [] as KanbanJob[]])) as ColumnsState;
  for (const job of jobs) {
    grouped[job.application_status].push(job);
  }
  return grouped;
}

const EMPTY_MESSAGES: Record<ApplicationStatus, string> = {
  draft: "No saved jobs yet.",
  applied: "No applications yet — mark a job applied from its detail page.",
  interviewing: "Nothing in this stage yet.",
  offered: "No offers yet — you'll see them here.",
  rejected: "Nothing here — hopefully it stays that way.",
};

function KanbanColumn({ status, jobs }: { status: ApplicationStatus; jobs: KanbanJob[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}>
          {STATUS_LABELS[status]}
        </span>
        <span className="text-xs font-medium text-text-muted">{jobs.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-col gap-2 rounded-2xl border border-dashed p-2 transition-colors ${
          isOver ? "border-accent bg-accent/5" : "border-border/60"
        }`}
      >
        <SortableContext items={jobs.map((job) => job.id)} strategy={verticalListSortingStrategy}>
          {jobs.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-text-muted">{EMPTY_MESSAGES[status]}</p>
          ) : (
            jobs.map((job) => <KanbanCard key={job.id} job={job} />)
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function KanbanBoard({ jobs }: { jobs: KanbanJob[] }) {
  const [columns, setColumns] = useState<ColumnsState>(() => groupByStatus(jobs));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function findColumnOf(jobId: string): ApplicationStatus | null {
    for (const status of STAGE_ORDER) {
      if (columns[status].some((job) => job.id === jobId)) return status;
    }
    return null;
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) return;

    const fromStatus = findColumnOf(String(active.id));
    if (!fromStatus) return;

    // over.id is either a column id directly (dropped on an empty/sparse
    // column's own droppable area) or a card id (dropped over another
    // card) — resolve to the containing column either way.
    const overId = String(over.id);
    const toStatus = (STAGE_ORDER as string[]).includes(overId)
      ? (overId as ApplicationStatus)
      : findColumnOf(overId);

    if (!toStatus || toStatus === fromStatus) return;

    const job = columns[fromStatus].find((j) => j.id === active.id);
    if (!job) return;

    setColumns((prev) => ({
      ...prev,
      [fromStatus]: prev[fromStatus].filter((j) => j.id !== job.id),
      [toStatus]: [{ ...job, application_status: toStatus }, ...prev[toStatus]],
    }));

    void setApplicationStatus(job.id, fromStatus, toStatus).then((result) => {
      if (!result.success) {
        setColumns((prev) => ({
          ...prev,
          [toStatus]: prev[toStatus].filter((j) => j.id !== job.id),
          [fromStatus]: [{ ...job, application_status: fromStatus }, ...prev[fromStatus]],
        }));
      }
    });
  }

  return (
    <DndContext id="pipeline-kanban" sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGE_ORDER.map((status) => (
          <KanbanColumn key={status} status={status} jobs={columns[status]} />
        ))}
      </div>
    </DndContext>
  );
}
