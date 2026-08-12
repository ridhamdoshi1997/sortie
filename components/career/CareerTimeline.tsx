"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { deleteAccomplishment } from "@/actions/accomplishments";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AddAccomplishmentModal } from "@/components/career/AddAccomplishmentModal";
import { formatDate } from "@/lib/utils";
import type { AccomplishmentRow } from "@/actions/accomplishments";

export type TimelineEntry = {
  id: string;
  kind: "work_experience" | "education" | "accomplishment" | "job_outcome";
  sortDate: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  tags: string[];
  // Only present for kind: "accomplishment" — read-only entries (profile
  // history, job outcomes) are owned by Profile/the tracker, not duplicated
  // here as editable.
  accomplishment?: AccomplishmentRow;
};

// Accomplishments are user-authored content, not AI output — deliberately
// NOT agent-teal (that's reserved exclusively for AI-generated content,
// see ui-rules.md). Uses the app's accent color instead, same "user action"
// treatment as everywhere else a user directly creates something.
const DOT_CLASSES: Record<TimelineEntry["kind"], string> = {
  work_experience: "bg-info-light",
  education: "bg-info-light",
  accomplishment: "bg-accent/20",
  job_outcome: "bg-surface-secondary",
};
const DOT_INNER_CLASSES: Record<TimelineEntry["kind"], string> = {
  work_experience: "bg-info",
  education: "bg-info",
  accomplishment: "bg-accent",
  job_outcome: "bg-text-muted",
};

export function CareerTimeline({ entries }: { entries: TimelineEntry[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccomplishmentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AccomplishmentRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function openAdd(): void {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row: AccomplishmentRow): void {
    setEditing(row);
    setModalOpen(true);
  }

  function handleConfirmDelete(): void {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      await deleteAccomplishment(id);
      setDeleteTarget(null);
    });
  }

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold leading-6 text-text-primary">Career Timeline</h2>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Log an accomplishment
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="mt-5 text-sm text-text-muted">
          Nothing here yet. Log a win — a project shipped, a skill learned, anything worth
          remembering — even when you&apos;re not job hunting.
        </p>
      ) : (
        <ul className="mt-5 space-y-5">
          {entries.map((entry) => (
            <li key={`${entry.kind}-${entry.id}`} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full ${DOT_CLASSES[entry.kind]}`}
              >
                <span className={`h-2 w-2 rounded-full ${DOT_INNER_CLASSES[entry.kind]}`} />
              </span>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium leading-5 text-text-primary">{entry.title}</p>
                    {entry.subtitle && (
                      <p className="text-xs text-text-secondary">{entry.subtitle}</p>
                    )}
                  </div>
                  {entry.accomplishment && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(entry.accomplishment!)}
                        aria-label="Edit"
                        className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(entry.accomplishment!)}
                        aria-label="Delete"
                        className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {entry.description && (
                  <p className="mt-1 text-sm text-text-secondary">{entry.description}</p>
                )}
                {entry.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-text-muted">{formatDate(entry.sortDate)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <AddAccomplishmentModal initial={editing} onClose={() => setModalOpen(false)} />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this accomplishment?"
        description={deleteTarget ? `"${deleteTarget.title}" will be permanently removed.` : ""}
        pending={isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
