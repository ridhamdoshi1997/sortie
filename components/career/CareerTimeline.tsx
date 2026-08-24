"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Plus, Send, Trash2 } from "lucide-react";

import { addAccomplishment, deleteAccomplishment } from "@/actions/accomplishments";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AddAccomplishmentModal } from "@/components/career/AddAccomplishmentModal";
import { formatDate } from "@/lib/utils";
import type { CareerEpoch, EducationEntry, JobOutcomeEntry, TimelineEntry } from "@/lib/careerTimeline";
import type { AccomplishmentRow } from "@/actions/accomplishments";

const TIMELINE_DOT_CLASSES: Record<TimelineEntry["kind"], string> = {
  accomplishment: "bg-accent",
  education: "bg-info",
  application_event: "bg-agent",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateRangeLabel(startDate: string, endDate: string | null, isCurrent: boolean): string {
  const start = formatDate(startDate);
  if (isCurrent) return `${start} — Present`;
  if (!endDate) return start;
  return `${start} — ${formatDate(endDate)}`;
}

// Lightweight, no-modal "what did you achieve today?" input — the second
// half of the two-part structural fix from agy's research (build-plan.md
// §E): the page previously had no way to add anything from itself without
// opening the full modal. Always dated today; nests automatically into
// whichever epoch's date range contains today (i.e. the current role, if
// one exists) via the same date-containment logic every other accomplishment
// uses — no separate code path.
function QuickAddBar() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(): void {
    const title = text.trim();
    if (!title || isPending) return;
    startTransition(async () => {
      const result = await addAccomplishment({ title, description: "", date: todayIso(), tags: [] });
      if (result.success) {
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-secondary px-4 py-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="What did you achieve today? A small win counts too."
        disabled={isPending}
        className="h-9 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
      />
      <button
        type="button"
        onClick={submit}
        disabled={isPending || !text.trim()}
        aria-label="Log it"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

function AccomplishmentRowItem({
  row,
  onEdit,
  onDelete,
}: {
  row: AccomplishmentRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-5 text-text-primary">{row.title}</p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit"
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete"
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {row.description && <p className="mt-1 text-sm text-text-secondary">{row.description}</p>}
        {row.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {row.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-text-muted">{formatDate(row.date)}</p>
      </div>
    </li>
  );
}

function EpochCard({
  epoch,
  onAdd,
  onEdit,
  onDelete,
}: {
  epoch: CareerEpoch;
  onAdd: () => void;
  onEdit: (row: AccomplishmentRow) => void;
  onDelete: (row: AccomplishmentRow) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-start justify-between gap-3 border-b border-border bg-surface-secondary px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            className={`mt-0.5 h-4 w-4 shrink-0 text-text-muted transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
          <div>
            <p className="text-sm font-semibold text-text-primary">{epoch.title}</p>
            <p className="text-xs text-text-secondary">
              {epoch.company} · {dateRangeLabel(epoch.startDate, epoch.endDate, epoch.isCurrent)}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          <Plus className="h-3 w-3" />
          Log here
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 px-4 py-4">
          {epoch.responsibilities && (
            <p className="text-sm leading-6 text-text-secondary">{epoch.responsibilities}</p>
          )}
          {epoch.accomplishments.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {epoch.accomplishments.map((row) => (
                <AccomplishmentRowItem
                  key={row.id}
                  row={row}
                  onEdit={() => onEdit(row)}
                  onDelete={() => onDelete(row)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-text-muted">Nothing logged for this role yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  epochs: CareerEpoch[];
  unassigned: AccomplishmentRow[];
  education: EducationEntry[];
  jobOutcomes: JobOutcomeEntry[];
  flatTimeline: TimelineEntry[];
};

export function CareerTimeline({ epochs, unassigned, education, jobOutcomes, flatTimeline }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AccomplishmentRow | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<AccomplishmentRow | null>(null);
  const [isPending, startTransition] = useTransition();
  // Epoch view stays the default (career data is epoch-based — build-plan.md
  // §E's structural finding). Timeline view is the §Q1 addition: a single
  // merged reverse-chronological list where the real application_events
  // history (every logged status transition, with its optional note)
  // actually shows up, instead of each job's current-status-only summary.
  const [view, setView] = useState<"epoch" | "timeline">("epoch");

  function openAddFor(epoch: CareerEpoch | null): void {
    setEditing(null);
    setModalDefaultDate(epoch ? (epoch.isCurrent ? todayIso() : epoch.endDate ?? epoch.startDate) : undefined);
    setModalOpen(true);
  }

  function openEdit(row: AccomplishmentRow): void {
    setEditing(row);
    setModalDefaultDate(undefined);
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

  const isEmpty = epochs.length === 0 && unassigned.length === 0 && education.length === 0 && jobOutcomes.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <QuickAddBar />

      {!isEmpty && (
        <div className="flex w-fit items-center gap-1 rounded-full border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setView("epoch")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "epoch" ? "bg-accent text-accent-foreground" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Career view
          </button>
          <button
            type="button"
            onClick={() => setView("timeline")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "timeline" ? "bg-accent text-accent-foreground" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Full timeline
          </button>
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <p className="text-sm text-text-muted">
            Nothing here yet. Log a win — a project shipped, a skill learned, anything worth
            remembering — even when you&apos;re not job hunting.
          </p>
        </div>
      ) : view === "timeline" ? (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          {flatTimeline.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {flatTimeline.map((entry) => (
                <li key={`${entry.kind}-${entry.id}`} className="flex items-start gap-3">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TIMELINE_DOT_CLASSES[entry.kind]}`} />
                  <div>
                    <p className="text-sm font-medium leading-5 text-text-primary">{entry.title}</p>
                    {entry.subtitle && <p className="mt-1 text-sm text-text-secondary">{entry.subtitle}</p>}
                    <p className="mt-1 text-xs text-text-muted">{formatDate(entry.date)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">Nothing logged yet.</p>
          )}
        </div>
      ) : (
        <>
          {epochs.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-text-primary">Career</h2>
              {epochs.map((epoch) => (
                <EpochCard
                  key={epoch.id}
                  epoch={epoch}
                  onAdd={() => openAddFor(epoch)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}

          {unassigned.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">Unassigned</h2>
                  <p className="text-xs text-text-muted">
                    Logged outside any role&apos;s dates — from a gap, a side project, or before your
                    first role.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openAddFor(null)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Log an accomplishment
                </button>
              </div>
              <ul className="mt-4 flex flex-col gap-4">
                {unassigned.map((row) => (
                  <AccomplishmentRowItem
                    key={row.id}
                    row={row}
                    onEdit={() => openEdit(row)}
                    onDelete={() => setDeleteTarget(row)}
                  />
                ))}
              </ul>
            </div>
          )}

          {education.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <h2 className="text-base font-semibold text-text-primary">Education</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {education.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
                    <div>
                      <p className="text-sm font-medium leading-5 text-text-primary">{entry.title}</p>
                      {entry.subtitle && <p className="text-xs text-text-secondary">{entry.subtitle}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {jobOutcomes.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <h2 className="text-base font-semibold text-text-primary">Job search activity</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {jobOutcomes.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-text-muted" />
                    <div>
                      <p className="text-sm font-medium leading-5 text-text-primary">{entry.title}</p>
                      {entry.subtitle && <p className="text-xs text-text-secondary">{entry.subtitle}</p>}
                      <p className="mt-1 text-xs text-text-muted">{formatDate(entry.sortDate)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <AddAccomplishmentModal initial={editing} defaultDate={modalDefaultDate} onClose={() => setModalOpen(false)} />
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
