"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Eye, EyeOff, GripVertical, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";

import { rewriteResumeBullet } from "@/actions/documents";
import { TagInput, FormInput, FormSelect, FormLabel, DEGREE_OPTIONS } from "@/components/ui/FormControls";
import type { Education } from "@/types";
import type { ResumeSection, TailoredWorkEntry } from "@/types/resumeEditor";

const SECTION_LABELS: Record<ResumeSection["type"], string> = {
  summary: "Professional Summary",
  skills: "Skills",
  work_experience: "Work Experience",
  education: "Education",
};

export type FocusTarget = { company: string; bulletText: string };

type Props = {
  jobId: string;
  sections: ResumeSection[];
  onChange: (next: ResumeSection[]) => void;
  // Set by ActionPlan (AI Rewrite tab) when the user clicks a specific
  // flagged bullet — auto-opens the Work Experience section and scrolls to
  // it, rather than making them hunt for it themselves.
  focusTarget?: FocusTarget | null;
  onFocusHandled?: () => void;
};

export function EditorTab({ jobId, sections, onChange, focusTarget, onFocusHandled }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (!focusTarget) return;
    // Deferred, not called synchronously in the effect body — this
    // project's own react-hooks/set-state-in-effect rule flags a direct
    // setState call in an effect's synchronous execution path.
    const timer = setTimeout(() => {
      const workSection = sections.find((s) => s.type === "work_experience");
      if (workSection) setOpenId(workSection.id);
      onFocusHandled?.();
    }, 0);
    return () => clearTimeout(timer);
    // Only react to a genuinely new focus request, not every sections change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(sections, oldIndex, newIndex));
  }

  function toggleVisible(id: string) {
    onChange(sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)));
  }

  function updateSection(id: string, next: ResumeSection) {
    onChange(sections.map((s) => (s.id === id ? next : s)));
  }

  const hiddenSections = sections.filter((s) => !s.visible);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-agent-light p-4">
        <p className="text-xs leading-6 text-agent-dark">
          <strong>Edits here apply only to this tailored résumé.</strong> Your base profile is never touched —
          for a change you want to carry into every future résumé, update your profile instead.
        </p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {sections.map((section) => (
              <SortableSectionRow
                key={section.id}
                jobId={jobId}
                section={section}
                isOpen={openId === section.id}
                focusTarget={focusTarget}
                onToggleOpen={() => setOpenId(openId === section.id ? null : section.id)}
                onToggleVisible={() => toggleVisible(section.id)}
                onUpdate={(next) => updateSection(section.id, next)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {hiddenSections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hiddenSections.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleVisible(s.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Show {SECTION_LABELS[s.type]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableSectionRow({
  jobId,
  section,
  isOpen,
  focusTarget,
  onToggleOpen,
  onToggleVisible,
  onUpdate,
}: {
  jobId: string;
  section: ResumeSection;
  isOpen: boolean;
  focusTarget?: FocusTarget | null;
  onToggleOpen: () => void;
  onToggleVisible: () => void;
  onUpdate: (next: ResumeSection) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-surface-secondary">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab touch-none text-text-muted hover:text-text-primary"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 shrink-0" />
        </button>
        <span
          className={`flex-1 text-xs font-semibold uppercase tracking-wide ${
            section.visible ? "text-text-primary" : "text-text-muted line-through"
          }`}
        >
          {SECTION_LABELS[section.type]}
        </span>
        <button
          type="button"
          onClick={onToggleVisible}
          className="rounded-md p-1 text-text-muted hover:text-error"
          aria-label={section.visible ? "Hide section" : "Show section"}
        >
          {section.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          className="rounded-md p-1 text-text-muted hover:text-text-primary"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>
      {isOpen && (
        <div className="border-t border-border p-3">
          <SectionEditor jobId={jobId} section={section} focusTarget={focusTarget} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

function SectionEditor({
  jobId,
  section,
  focusTarget,
  onUpdate,
}: {
  jobId: string;
  section: ResumeSection;
  focusTarget?: FocusTarget | null;
  onUpdate: (next: ResumeSection) => void;
}) {
  if (section.type === "summary") {
    return (
      <textarea
        rows={5}
        value={section.content}
        onChange={(e) => onUpdate({ ...section, content: e.target.value })}
        className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-xs leading-6 text-text-primary outline-none focus-visible:border-accent"
      />
    );
  }

  if (section.type === "skills") {
    return (
      <TagInput
        tags={section.items}
        onAdd={(tag) => onUpdate({ ...section, items: [...section.items, tag] })}
        onRemove={(tag) => onUpdate({ ...section, items: section.items.filter((s) => s !== tag) })}
        placeholder="Add a skill"
      />
    );
  }

  if (section.type === "work_experience") {
    return (
      <div className="flex flex-col gap-4">
        {section.entries.map((entry, i) => (
          <WorkEntryEditor
            key={i}
            jobId={jobId}
            entry={entry}
            focusTarget={focusTarget}
            onUpdate={(patch) =>
              onUpdate({ ...section, entries: section.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
            }
            onRemove={() => onUpdate({ ...section, entries: section.entries.filter((_, idx) => idx !== i) })}
          />
        ))}
      </div>
    );
  }

  // education
  return (
    <div className="flex flex-col gap-4">
      {section.entries.map((entry, i) => (
        <EducationEntryEditor
          key={i}
          entry={entry}
          onUpdate={(patch) =>
            onUpdate({ ...section, entries: section.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
          }
        />
      ))}
    </div>
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function WorkEntryEditor({
  jobId,
  entry,
  focusTarget,
  onUpdate,
  onRemove,
}: {
  jobId: string;
  entry: TailoredWorkEntry;
  focusTarget?: FocusTarget | null;
  onUpdate: (patch: Partial<TailoredWorkEntry>) => void;
  onRemove: () => void;
}) {
  const [rewritingIndex, setRewritingIndex] = useState<number | null>(null);
  const [instructingIndex, setInstructingIndex] = useState<number | null>(null);
  const [instructionText, setInstructionText] = useState("");
  const [bulletError, setBulletError] = useState<{ index: number; message: string } | null>(null);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const bulletRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  // Two separate ref-tracked timers, not the effect's own cleanup — a
  // cleanup tied to `focusTarget` churn would cancel the fade-out the
  // instant the parent clears its own transient focus state, leaving the
  // highlight stuck forever instead of fading after ~2.5s.
  const deferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll to + briefly highlight the bullet an ActionPlan item pointed at.
  useEffect(() => {
    if (!focusTarget || normalize(focusTarget.company) !== normalize(entry.company)) return;
    const idx = entry.bullets.findIndex(
      (b) => b.includes(focusTarget.bulletText) || focusTarget.bulletText.includes(b),
    );
    if (idx === -1) return;
    // Deferred, not called synchronously in the effect body — this
    // project's own react-hooks/set-state-in-effect rule flags a direct
    // setState call in an effect's synchronous execution path.
    deferTimer.current = setTimeout(() => {
      setHighlightIndex(idx);
      bulletRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
      bulletRefs.current[idx]?.focus();
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightIndex(null), 2500);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget]);

  useEffect(
    () => () => {
      if (deferTimer.current) clearTimeout(deferTimer.current);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  async function applyRewrite(j: number, instruction?: string) {
    setRewritingIndex(j);
    setBulletError(null);
    try {
      const result = await rewriteResumeBullet(jobId, entry.title, entry.company, entry.bullets[j], instruction);
      if (result.success && result.text) {
        onUpdate({ bullets: entry.bullets.map((b, idx) => (idx === j ? result.text! : b)) });
        setInstructingIndex(null);
        setInstructionText("");
      } else {
        setBulletError({ index: j, message: result.error ?? "Failed to rewrite this bullet. Please try again." });
      }
    } catch {
      // A thrown network/server error (not a returned {success:false}) would
      // otherwise leave the spinner stuck forever with zero visible feedback
      // — the finally block below always clears it, this always surfaces it.
      setBulletError({ index: j, message: "Network error. Please try again." });
    } finally {
      setRewritingIndex(null);
    }
  }

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-text-primary">
          {entry.title} at {entry.company}
        </p>
        <button type="button" onClick={onRemove} className="text-text-muted hover:text-error" aria-label="Remove this role">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {entry.bullets.map((bullet, j) => (
          <div key={j} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <textarea
                ref={(el) => {
                  bulletRefs.current[j] = el;
                }}
                rows={2}
                value={bullet}
                onChange={(e) => {
                  const next = entry.bullets.map((b, idx) => (idx === j ? e.target.value : b));
                  onUpdate({ bullets: next });
                }}
                className={`flex-1 resize-none rounded-lg border bg-surface p-2 text-xs leading-5 text-text-primary outline-none transition-colors focus-visible:border-accent ${
                  highlightIndex === j ? "border-accent ring-2 ring-accent/40" : "border-border"
                }`}
              />
              <button
                type="button"
                onClick={() => onUpdate({ bullets: entry.bullets.filter((_, idx) => idx !== j) })}
                className="mt-1 shrink-0 text-text-muted hover:text-error"
                aria-label="Remove bullet"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-3 pl-0.5">
              <button
                type="button"
                disabled={rewritingIndex === j}
                onClick={() => setInstructingIndex(instructingIndex === j ? null : j)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                Edit with AI
              </button>
              <button
                type="button"
                disabled={rewritingIndex === j}
                onClick={() => applyRewrite(j)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted transition-colors hover:text-accent disabled:opacity-50"
              >
                {rewritingIndex === j ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Regenerate
              </button>
            </div>
            {instructingIndex === j && (
              <div className="flex items-center gap-2 pl-0.5">
                <input
                  autoFocus
                  value={instructionText}
                  onChange={(e) => setInstructionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && instructionText.trim()) applyRewrite(j, instructionText.trim());
                  }}
                  placeholder="e.g. make it about leadership"
                  className="h-8 flex-1 rounded-lg border border-border bg-surface px-2 text-xs text-text-primary outline-none focus-visible:border-accent"
                />
                <button
                  type="button"
                  disabled={rewritingIndex === j || !instructionText.trim()}
                  onClick={() => applyRewrite(j, instructionText.trim())}
                  className="rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accent-foreground disabled:opacity-50"
                >
                  Go
                </button>
              </div>
            )}
            {bulletError?.index === j && <p className="pl-0.5 text-[11px] text-error">{bulletError.message}</p>}
          </div>
        ))}
        <button
          type="button"
          onClick={() => onUpdate({ bullets: [...entry.bullets, ""] })}
          className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-accent hover:underline"
        >
          <Plus className="h-3 w-3" /> Add bullet
        </button>
      </div>
    </div>
  );
}

function EducationEntryEditor({
  entry,
  onUpdate,
}: {
  entry: Education;
  onUpdate: (patch: Partial<Education>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-2">
      <div>
        <FormLabel>Degree</FormLabel>
        <FormSelect
          options={DEGREE_OPTIONS}
          value={entry.degree ?? ""}
          onChange={(v) => onUpdate({ degree: v })}
          placeholder="Select degree..."
        />
      </div>
      <div>
        <FormLabel>Field of Study</FormLabel>
        <FormInput value={entry.field ?? ""} onChange={(v) => onUpdate({ field: v })} placeholder="Computer Science" />
      </div>
      <div>
        <FormLabel>Institution</FormLabel>
        <FormInput value={entry.institution ?? ""} onChange={(v) => onUpdate({ institution: v })} />
      </div>
      <div>
        <FormLabel>Graduation Year</FormLabel>
        <FormInput value={entry.graduation_year ?? ""} onChange={(v) => onUpdate({ graduation_year: v })} />
      </div>
    </div>
  );
}
