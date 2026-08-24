"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addAccomplishment, updateAccomplishment, type AccomplishmentRow } from "@/actions/accomplishments";
import { SectionModal } from "@/components/profile/SectionModal";

const inputClass =
  "h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddAccomplishmentModal({
  initial,
  defaultDate,
  onClose,
}: {
  initial: AccomplishmentRow | null;
  // Lets a "+" inside a specific role epoch pre-fill a date that falls
  // within that role's range, so the new entry's date-range auto-bucketing
  // (lib/careerTimeline.ts) naturally nests it there without needing an
  // explicit role picker — no-op when editing an existing entry.
  defaultDate?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.date ?? defaultDate ?? todayIso());
  const [tagsInput, setTagsInput] = useState((initial?.tags ?? []).join(", "));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave(): void {
    if (!title.trim()) {
      setError("Give it a short title.");
      return;
    }
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    startTransition(async () => {
      const result = initial
        ? await updateAccomplishment(initial.id, { title, description, date, tags })
        : await addAccomplishment({ title, description, date, tags });

      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }

      router.refresh();
      onClose();
    });
  }

  return (
    <SectionModal
      title={initial ? "Edit accomplishment" : "Log an accomplishment"}
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
            placeholder="Shipped the v2 checkout redesign"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What happened, and why it mattered"
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">
            Tags (comma-separated)
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="leadership, design, launch"
            className={inputClass}
          />
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    </SectionModal>
  );
}
