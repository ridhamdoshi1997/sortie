"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Link2, Plus, Star, Trash2, Unlink } from "lucide-react";

import {
  deleteStarStory,
  linkStarStoryToInterview,
  type StarStoryRow,
} from "@/actions/starStories";
import { StarStoryEditor } from "@/components/interview/StarStoryMatrix";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { InterviewEventWithJobRow } from "@/actions/careerEvents";

// §Q4a STAR Vault surfacing (build-plan.md §Q4) — the story bank already
// lives fully-CRUD'd behind /interview's job-matching flow (StarStoryMatrix);
// this is the same data resurfaced on /career as a standalone career asset,
// plus the one genuinely new piece: linking a story to the real
// interview_events row it was used for. No new story-editing UI — reuses
// StarStoryEditor verbatim so the two surfaces never drift.
export function StarVault({
  initialStories,
  interviewEvents,
}: {
  initialStories: StarStoryRow[];
  interviewEvents: InterviewEventWithJobRow[];
}) {
  const [stories, setStories] = useState(initialStories);
  const [editing, setEditing] = useState<StarStoryRow | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StarStoryRow | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkPending, startLinkTransition] = useTransition();

  const eventsById = new Map(interviewEvents.map((e) => [e.id, e]));

  function handleConfirmDelete(): void {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startDeleteTransition(async () => {
      await deleteStarStory(id);
      setStories((prev) => prev.filter((s) => s.id !== id));
      setDeleteTarget(null);
    });
  }

  function handleLink(storyId: string, interviewEventId: string | null): void {
    setLinkingId(null);
    startLinkTransition(async () => {
      const result = await linkStarStoryToInterview(storyId, interviewEventId);
      if (!result.success) return;
      setStories((prev) =>
        prev.map((s) => (s.id === storyId ? { ...s, interview_event_id: interviewEventId } : s)),
      );
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="signal-icon-chip">
            <Star className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold text-text-primary">STAR Vault</h2>
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

      <p className="mb-4 mt-1 text-sm text-text-secondary">
        Your reusable interview stories, kept independent of any one job. Also matchable against any
        company&apos;s question bank on the{" "}
        <Link href="/interview" className="text-accent hover:underline">
          Interview
        </Link>{" "}
        page.
      </p>

      {stories.length === 0 ? (
        <p className="text-sm text-text-muted">No stories yet. Add one to start your vault.</p>
      ) : (
        <div className="signal-rail">
          {stories.map((story) => {
            const linkedEvent = story.interview_event_id ? eventsById.get(story.interview_event_id) : null;
            const isLinking = linkingId === story.id;
            return (
              <div key={story.id} className="signal-track signal-track-top">
                <span className="signal-dot" />
                <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
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

                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
                  {linkedEvent ? (
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <Link2 className="h-3 w-3 text-accent" />
                      <span>
                        Used in interview at{" "}
                        <span className="font-medium text-text-secondary">
                          {[linkedEvent.job_title, linkedEvent.job_company].filter(Boolean).join(" — ") ||
                            "a tracked role"}
                        </span>{" "}
                        ({new Date(linkedEvent.event_date).toLocaleDateString()})
                      </span>
                      <button
                        type="button"
                        disabled={linkPending}
                        onClick={() => handleLink(story.id, null)}
                        className="inline-flex items-center gap-1 text-text-muted underline decoration-dotted hover:text-error disabled:opacity-60"
                      >
                        <Unlink className="h-3 w-3" />
                        Unlink
                      </button>
                    </div>
                  ) : isLinking ? (
                    <select
                      autoFocus
                      disabled={linkPending}
                      defaultValue=""
                      onChange={(e) => handleLink(story.id, e.target.value || null)}
                      onBlur={() => setLinkingId(null)}
                      className="h-8 max-w-full rounded-md border border-border bg-surface px-2 text-xs text-text-primary outline-none focus-visible:border-accent"
                    >
                      <option value="" disabled>
                        Select an interview...
                      </option>
                      {interviewEvents.map((e) => (
                        <option key={e.id} value={e.id}>
                          {[e.job_title, e.job_company].filter(Boolean).join(" — ") || "Untitled role"} (
                          {new Date(e.event_date).toLocaleDateString()})
                        </option>
                      ))}
                    </select>
                  ) : interviewEvents.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setLinkingId(story.id)}
                      className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent"
                    >
                      <Link2 className="h-3 w-3" />
                      Link to an interview
                    </button>
                  ) : (
                    <span className="text-xs text-text-muted">
                      Log an interview outcome on a job to link stories here.
                    </span>
                  )}
                </div>
                </div>
              </div>
            );
          })}
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
