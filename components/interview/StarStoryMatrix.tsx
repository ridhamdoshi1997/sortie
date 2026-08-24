"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Sparkles, Star, Trash2 } from "lucide-react";

import {
  addStarStory,
  deleteStarStory,
  matchStoriesToRole,
  updateStarStory,
  type StarStoryRow,
} from "@/actions/starStories";
import type { StarMatchResult } from "@/lib/starStoryMatcher";
import { SectionModal } from "@/components/profile/SectionModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const inputClass =
  "h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent";
const textareaClass =
  "w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent";

// Candidate-tied, not job-tied — lives on the global /interview page per
// build-plan.md §N. Two independent halves: a zero-AI story CRUD list, and
// an on-demand ephemeral matcher against any company/role's Question Bank
// (actions/starStories.ts's matchStoriesToRole) — matches aren't persisted,
// they're a function of the user's current mutable story set.
export function StarStoryMatrix({ initialStories }: { initialStories: StarStoryRow[] }) {
  const router = useRouter();
  const [stories, setStories] = useState(initialStories);
  const [editing, setEditing] = useState<StarStoryRow | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StarStoryRow | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [seniority, setSeniority] = useState("");
  const [matchResult, setMatchResult] = useState<StarMatchResult | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matching, startMatchTransition] = useTransition();

  function handleConfirmDelete(): void {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startDeleteTransition(async () => {
      await deleteStarStory(id);
      setStories((prev) => prev.filter((s) => s.id !== id));
      setDeleteTarget(null);
    });
  }

  function runMatch(): void {
    if (stories.length === 0) {
      setMatchError("Add at least one STAR story first.");
      return;
    }
    if (!company.trim() || !title.trim()) {
      setMatchError("Enter at least a company and a role.");
      return;
    }
    setMatchError(null);
    startMatchTransition(async () => {
      const result = await matchStoriesToRole(company, title, seniority);
      if (!result.success) {
        setMatchError(result.error);
        return;
      }
      setMatchResult(result.result);
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-text-secondary" />
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
            STAR Story Matrix
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          <Plus className="h-4 w-4" />
          Add story
        </button>
      </div>

      <p className="mt-3 text-sm text-text-muted">
        Write your real Situation/Task/Action/Result stories once, then match them against any
        company&apos;s question bank to see what&apos;s covered — and what&apos;s missing.
      </p>

      {stories.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">
          No stories yet. Add one to start building your matrix.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {stories.map((story) => (
            <div
              key={story.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-secondary p-4"
            >
              <button
                type="button"
                onClick={() => setEditing(story)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-text-primary">{story.title}</p>
                {story.tags.length > 0 && (
                  <p className="mt-1 truncate text-xs text-text-muted">{story.tags.join(", ")}</p>
                )}
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(story)}
                aria-label="Delete story"
                className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-secondary p-3">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Company</label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Stripe"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
        </div>
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Role</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Software Engineer"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
        </div>
        <div className="min-w-32 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Seniority (optional)</label>
          <input
            value={seniority}
            onChange={(e) => setSeniority(e.target.value)}
            placeholder="e.g. Senior"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
        </div>
        <button
          type="button"
          disabled={matching}
          onClick={runMatch}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {matching ? "Matching..." : "Match my stories"}
        </button>
      </div>

      {matchError && <p className="mt-3 text-xs text-error">{matchError}</p>}

      {matchResult && (
        <div className="mt-4 flex flex-col gap-3">
          {matchResult.gapSummary.length > 0 && (
            <div className="rounded-r-lg border-l-2 border-error bg-error/10 px-4 py-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-error">
                Coverage gaps
              </p>
              <p className="text-xs text-error">
                No story yet for: {matchResult.gapSummary.join(", ")}
              </p>
            </div>
          )}
          {matchResult.matches
            .filter((m) => m.category === "behavioral" || m.category === "culture_fit")
            .map((m, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface-secondary p-4">
                <p className="text-sm font-medium leading-6 text-text-primary">{m.questionText}</p>
                {m.matchedStoryTitle ? (
                  <p className="mt-1.5 text-xs text-accent">
                    Use: <span className="font-medium">{m.matchedStoryTitle}</span> — {m.rationale}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-text-muted">No story covers this yet — {m.rationale}</p>
                )}
              </div>
            ))}
        </div>
      )}

      {editing && (
        <StarStoryEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            setStories((prev) => {
              const withoutOld = prev.filter((s) => s.id !== row.id);
              return [row, ...withoutOld];
            });
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this story?"
        description={deleteTarget ? `"${deleteTarget.title}" will be removed permanently.` : ""}
        pending={deletePending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

export function StarStoryEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: StarStoryRow | null;
  onClose: () => void;
  onSaved: (row: StarStoryRow) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [situation, setSituation] = useState(initial?.situation ?? "");
  const [task, setTask] = useState(initial?.task ?? "");
  const [action, setAction] = useState(initial?.action ?? "");
  const [result, setResult] = useState(initial?.result ?? "");
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave(): void {
    if (!title.trim() || !situation.trim() || !task.trim() || !action.trim() || !result.trim()) {
      setError("Fill in a title and all four STAR fields.");
      return;
    }
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const input = { title, situation, task, action, result, tags };

    startTransition(async () => {
      const saveResult = initial ? await updateStarStory(initial.id, input) : await addStarStory(input);
      if (!saveResult.success) {
        setError(saveResult.error ?? "Something went wrong.");
        return;
      }

      onSaved({
        id: initial?.id ?? crypto.randomUUID(),
        title,
        situation,
        task,
        action,
        result,
        tags,
        accomplishment_id: initial?.accomplishment_id ?? null,
        interview_event_id: initial?.interview_event_id ?? null,
        created_at: initial?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      onClose();
    });
  }

  return (
    <SectionModal
      title={initial ? "Edit story" : "Add a STAR story"}
      onClose={onClose}
      onSave={handleSave}
      saving={isPending}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Led the migration under a tight deadline"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Situation</label>
          <textarea
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            rows={2}
            placeholder="What was the context?"
            className={textareaClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Task</label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={2}
            placeholder="What were you responsible for?"
            className={textareaClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Action</label>
          <textarea
            value={action}
            onChange={(e) => setAction(e.target.value)}
            rows={3}
            placeholder="What did you actually do?"
            className={textareaClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Result</label>
          <textarea
            value={result}
            onChange={(e) => setResult(e.target.value)}
            rows={2}
            placeholder="What happened, ideally with a number"
            className={textareaClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">
            Tags (comma-separated)
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="leadership, conflict, ambiguity"
            className={inputClass}
          />
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    </SectionModal>
  );
}
