"use client";

import { useState, useTransition } from "react";
import { NotebookPen } from "lucide-react";

import { updateJobNotes, updateJobTags } from "@/actions/jobs";
import { TagInput } from "@/components/ui/FormControls";

// Plain user-authored tracker metadata — no AI, immediate save (tags: on
// every add/remove, matching how TagInput is used elsewhere; notes: on
// blur, so a note in progress isn't hammering the server on every keystroke).
export function JobTagsAndNotes({
  jobId,
  initialTags,
  initialNotes,
}: {
  jobId: string;
  initialTags: string[];
  initialNotes: string | null;
}) {
  const [tags, setTags] = useState(initialTags);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [, startTagsTransition] = useTransition();
  const [notesSaved, setNotesSaved] = useState(true);

  function handleAddTag(tag: string): void {
    const next = [...tags, tag];
    setTags(next);
    startTagsTransition(async () => {
      await updateJobTags(jobId, next);
    });
  }

  function handleRemoveTag(tag: string): void {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    startTagsTransition(async () => {
      await updateJobTags(jobId, next);
    });
  }

  function handleNotesBlur(): void {
    if (notes === (initialNotes ?? "")) return;
    startTagsTransition(async () => {
      await updateJobNotes(jobId, notes);
      setNotesSaved(true);
    });
  }

  return (
    // Pane inside the shared Tracking card — see JobDeadline.tsx's comment.
    <div className="border-t border-border-light px-6 py-6 first:border-t-0">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <NotebookPen className="h-3.5 w-3.5" />
        Tags &amp; Notes
      </h3>

      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Tags</label>
          <TagInput tags={tags} onAdd={handleAddTag} onRemove={handleRemoveTag} placeholder="e.g. dream-job, high-priority" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Personal notes</label>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesSaved(false);
            }}
            onBlur={handleNotesBlur}
            rows={3}
            placeholder="Anything you want to remember about this one — a recruiter's name, a gut feeling, a reason it's a stretch..."
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
          {!notesSaved && <p className="mt-1 text-[11px] text-text-muted">Saves when you click away</p>}
        </div>
      </div>
    </div>
  );
}
