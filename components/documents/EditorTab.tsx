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
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { TagInput, FormInput, FormSelect, FormLabel, DEGREE_OPTIONS } from "@/components/ui/FormControls";
import type { Education } from "@/types";
import {
  sectionDisplayLabel,
  type CertificationEntry,
  type CustomEntry,
  type ResumeSection,
  type ResumeSectionType,
  type TailoredWorkEntry,
} from "@/types/resumeEditor";

function newId(): string {
  return crypto.randomUUID();
}

function defaultLabelFor(type: ResumeSectionType): string {
  switch (type) {
    case "summary":
      return "Professional Summary";
    case "skills":
      return "Skills";
    case "work_experience":
      return "Work Experience";
    case "education":
      return "Education";
    case "certifications":
      return "Certifications";
    case "custom":
      return "Custom Section";
  }
}

function sectionLabelFor(section: ResumeSection): string {
  return sectionDisplayLabel(section, defaultLabelFor(section.type));
}

// Researched via agy: real builders (Enhancv/Novoresume) offer a small fixed
// catalog plus a blank "escape hatch" — not a bespoke data model per preset,
// just labels layered on one generic entry shape (CustomEntry, below).
// Certifications isn't in this list — it's a first-class section type (see
// ResumeSection), offered separately in the "Add section" catalog below so
// résumés generated before that feature existed can still get one added.
const CUSTOM_SECTION_PRESETS = ["Projects", "Languages", "Awards", "Volunteer Experience", "Custom section"];

function blankWorkEntry(): TailoredWorkEntry {
  return { company: "", title: "", start_date: "", end_date: null, is_current: false, bullets: [""] };
}

function blankEducationEntry(): Education {
  return { degree: null, field: null, institution: null, graduation_year: null };
}

function blankCertificationEntry(): CertificationEntry {
  return { name: "", issuer: "", date: "" };
}

function blankCustomEntry(): CustomEntry {
  return { title: "", subtitle: "", date: "", bullets: [""] };
}

export type FocusTarget = { company: string; bulletText: string };

// Injected rather than hardcoded to a single server action — a tailored
// résumé rewrites a bullet with real job context (rewriteResumeBullet), an
// uploaded résumé slot has no job to pull that context from
// (rewriteResumeSlotBullet). Same request/response shape either way.
export type RewriteBulletFn = (
  entryTitle: string,
  entryCompany: string,
  bulletText: string,
  instruction?: string,
) => Promise<{ success: boolean; text?: string; error?: string }>;

type Props = {
  sections: ResumeSection[];
  onChange: (next: ResumeSection[]) => void;
  onRewriteBullet: RewriteBulletFn;
  // Set by ActionPlan (AI Rewrite tab) when the user clicks a specific
  // flagged bullet — auto-opens the Work Experience section and scrolls to
  // it, rather than making them hunt for it themselves.
  focusTarget?: FocusTarget | null;
  onFocusHandled?: () => void;
};

export function EditorTab({ sections, onChange, onRewriteBullet, focusTarget, onFocusHandled }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const addSectionRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!addSectionOpen) return;
    function onClickOutside(event: MouseEvent) {
      if (addSectionRef.current && !addSectionRef.current.contains(event.target as Node)) setAddSectionOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [addSectionOpen]);

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

  function renameSection(id: string, label: string) {
    onChange(
      sections.map((s) => {
        if (s.id !== id) return s;
        return s.type === "custom" ? { ...s, title: label } : { ...s, label };
      }),
    );
  }

  function removeSection(id: string) {
    onChange(sections.filter((s) => s.id !== id));
  }

  function addCustomSection(preset: string) {
    const section: ResumeSection = { id: newId(), type: "custom", visible: true, title: preset, entries: [blankCustomEntry()] };
    onChange([...sections, section]);
    setOpenId(section.id);
    setAddSectionOpen(false);
  }

  // Certifications is a real first-class section type (see ResumeSection),
  // not one of the generic custom presets — this only shows up in the
  // catalog at all for a tailored résumé generated before that feature
  // existed and therefore never got one seeded by buildDefaultSections.
  function addCertificationsSection() {
    const section: ResumeSection = { id: newId(), type: "certifications", visible: true, entries: [blankCertificationEntry()] };
    onChange([...sections, section]);
    setOpenId(section.id);
    setAddSectionOpen(false);
  }

  const hiddenSections = sections.filter((s) => !s.visible);
  const hasCertifications = sections.some((s) => s.type === "certifications");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-agent-light p-4">
        <p className="text-xs leading-6 text-agent-dark">
          <strong>Edits here apply only to this copy.</strong> The résumé data this was built from is never
          touched — for a change you want to carry into every future résumé, update your profile instead.
        </p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {sections.map((section) => (
              <SortableSectionRow
                key={section.id}
                onRewriteBullet={onRewriteBullet}
                section={section}
                isOpen={openId === section.id}
                focusTarget={focusTarget}
                onToggleOpen={() => setOpenId(openId === section.id ? null : section.id)}
                onToggleVisible={() => toggleVisible(section.id)}
                onUpdate={(next) => updateSection(section.id, next)}
                onRename={(label) => renameSection(section.id, label)}
                onRemove={
                  section.type === "custom" || section.type === "certifications" ? () => removeSection(section.id) : undefined
                }
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
              Show {sectionLabelFor(s)}
            </button>
          ))}
        </div>
      )}

      <div ref={addSectionRef} className="relative self-start">
        <button
          type="button"
          onClick={() => setAddSectionOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Add section
        </button>
        {addSectionOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-card">
            {!hasCertifications && (
              <button
                type="button"
                onClick={addCertificationsSection}
                className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                Certifications
              </button>
            )}
            {CUSTOM_SECTION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => addCustomSection(preset)}
                className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                {preset}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableSectionRow({
  onRewriteBullet,
  section,
  isOpen,
  focusTarget,
  onToggleOpen,
  onToggleVisible,
  onUpdate,
  onRename,
  onRemove,
}: {
  onRewriteBullet: RewriteBulletFn;
  section: ResumeSection;
  isOpen: boolean;
  focusTarget?: FocusTarget | null;
  onToggleOpen: () => void;
  onToggleVisible: () => void;
  onUpdate: (next: ResumeSection) => void;
  onRename: (label: string) => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [renaming, setRenaming] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");

  function commitRename() {
    const trimmed = labelDraft.trim();
    if (trimmed) onRename(trimmed);
    setRenaming(false);
  }

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

        {renaming ? (
          <input
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="h-6 flex-1 rounded-md border border-accent bg-surface px-1.5 text-xs font-semibold uppercase tracking-wide text-text-primary outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setLabelDraft(sectionLabelFor(section));
              setRenaming(true);
            }}
            className={`group flex flex-1 items-center gap-1.5 truncate text-left text-xs font-semibold uppercase tracking-wide ${
              section.visible ? "text-text-primary" : "text-text-muted line-through"
            }`}
          >
            <span className="truncate">{sectionLabelFor(section)}</span>
            <Pencil className="h-3 w-3 shrink-0 text-transparent transition-colors group-hover:text-text-muted/60" />
          </button>
        )}

        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded-md p-1 text-text-muted hover:text-error" aria-label="Delete section">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
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
          <SectionEditor onRewriteBullet={onRewriteBullet} section={section} focusTarget={focusTarget} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

// Reordering entries within a section (jobs, degrees, custom-section items)
// is a fully separate drag scope from the outer section-level DndContext
// above — its own DndContext instance per section instance, never sharing
// droppable ids with the section list or with any other section's entries.
// Distinct, always-smaller drag handles per nesting level (this component's
// GripVertical vs. the section row's) so a drag can't be started from the
// wrong level by accident — both per agy's research pass on nested-DND
// pitfalls (accidental parent-drag, cross-level drops, handle ambiguity).
type DragHandleProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

function EntryDragHandle({ attributes, listeners }: DragHandleProps) {
  return (
    <button
      {...attributes}
      {...listeners}
      type="button"
      className="mt-1 shrink-0 cursor-grab touch-none text-text-muted/60 hover:text-text-primary"
      aria-label="Drag to reorder"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );
}

function SortableList<T>({
  items,
  idPrefix,
  onReorder,
  renderItem,
}: {
  items: T[];
  idPrefix: string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number, dragHandle: DragHandleProps) => React.ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const ids = items.map((_, i) => `${idPrefix}-${i}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-4">
          {items.map((item, i) => (
            <SortableListItem key={ids[i]} id={ids[i]}>
              {(dragHandle) => renderItem(item, i, dragHandle)}
            </SortableListItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableListItem({ id, children }: { id: string; children: (dragHandle: DragHandleProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

function SectionEditor({
  onRewriteBullet,
  section,
  focusTarget,
  onUpdate,
}: {
  onRewriteBullet: RewriteBulletFn;
  section: ResumeSection;
  focusTarget?: FocusTarget | null;
  onUpdate: (next: ResumeSection) => void;
}) {
  if (section.type === "summary") {
    return (
      <textarea
        rows={5}
        value={section.content}
        placeholder="Briefly summarize your fit for this role — 2-3 sentences highlighting your strongest, most relevant qualifications."
        onChange={(e) => onUpdate({ ...section, content: e.target.value })}
        className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-xs leading-6 text-text-primary outline-none placeholder:text-text-muted/60 focus-visible:border-accent"
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
      <div className="flex flex-col gap-3">
        <SortableList
          idPrefix={`${section.id}-work`}
          items={section.entries}
          onReorder={(next) => onUpdate({ ...section, entries: next })}
          renderItem={(entry, i, dragHandle) => (
            <WorkEntryEditor
              onRewriteBullet={onRewriteBullet}
              entry={entry}
              focusTarget={focusTarget}
              dragHandle={dragHandle}
              onUpdate={(patch) =>
                onUpdate({ ...section, entries: section.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
              }
              onRemove={() => onUpdate({ ...section, entries: section.entries.filter((_, idx) => idx !== i) })}
              onDuplicate={() =>
                onUpdate({ ...section, entries: [...section.entries.slice(0, i + 1), { ...entry }, ...section.entries.slice(i + 1)] })
              }
            />
          )}
        />
        <button
          type="button"
          onClick={() => onUpdate({ ...section, entries: [...section.entries, blankWorkEntry()] })}
          className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-accent hover:underline"
        >
          <Plus className="h-3 w-3" /> Add work experience
        </button>
      </div>
    );
  }

  if (section.type === "education") {
    return (
      <div className="flex flex-col gap-3">
        <SortableList
          idPrefix={`${section.id}-edu`}
          items={section.entries}
          onReorder={(next) => onUpdate({ ...section, entries: next })}
          renderItem={(entry, i, dragHandle) => (
            <EducationEntryEditor
              entry={entry}
              dragHandle={dragHandle}
              onUpdate={(patch) =>
                onUpdate({ ...section, entries: section.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
              }
              onRemove={() => onUpdate({ ...section, entries: section.entries.filter((_, idx) => idx !== i) })}
              onDuplicate={() =>
                onUpdate({ ...section, entries: [...section.entries.slice(0, i + 1), { ...entry }, ...section.entries.slice(i + 1)] })
              }
            />
          )}
        />
        <button
          type="button"
          onClick={() => onUpdate({ ...section, entries: [...section.entries, blankEducationEntry()] })}
          className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-accent hover:underline"
        >
          <Plus className="h-3 w-3" /> Add education
        </button>
      </div>
    );
  }

  if (section.type === "certifications") {
    return (
      <div className="flex flex-col gap-3">
        <SortableList
          idPrefix={`${section.id}-cert`}
          items={section.entries}
          onReorder={(next) => onUpdate({ ...section, entries: next })}
          renderItem={(entry, i, dragHandle) => (
            <CertificationEntryEditor
              entry={entry}
              dragHandle={dragHandle}
              onUpdate={(patch) =>
                onUpdate({ ...section, entries: section.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
              }
              onRemove={() => onUpdate({ ...section, entries: section.entries.filter((_, idx) => idx !== i) })}
              onDuplicate={() =>
                onUpdate({ ...section, entries: [...section.entries.slice(0, i + 1), { ...entry }, ...section.entries.slice(i + 1)] })
              }
            />
          )}
        />
        <button
          type="button"
          onClick={() => onUpdate({ ...section, entries: [...section.entries, blankCertificationEntry()] })}
          className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-accent hover:underline"
        >
          <Plus className="h-3 w-3" /> Add certification
        </button>
      </div>
    );
  }

  // "custom"
  return (
    <div className="flex flex-col gap-3">
      <SortableList
        idPrefix={`${section.id}-custom`}
        items={section.entries}
        onReorder={(next) => onUpdate({ ...section, entries: next })}
        renderItem={(entry, i, dragHandle) => (
          <CustomEntryEditor
            entry={entry}
            dragHandle={dragHandle}
            onUpdate={(patch) =>
              onUpdate({ ...section, entries: section.entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
            }
            onRemove={() => onUpdate({ ...section, entries: section.entries.filter((_, idx) => idx !== i) })}
            onDuplicate={() =>
              onUpdate({ ...section, entries: [...section.entries.slice(0, i + 1), { ...entry }, ...section.entries.slice(i + 1)] })
            }
          />
        )}
      />
      <button
        type="button"
        onClick={() => onUpdate({ ...section, entries: [...section.entries, blankCustomEntry()] })}
        className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-accent hover:underline"
      >
        <Plus className="h-3 w-3" /> Add entry
      </button>
    </div>
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

type PendingSuggestion = { index: number; original: string; suggested: string; instruction?: string };

// <40 or >150 chars is a rough proxy for "won't fit one line at the sizes
// this app's templates actually render at" — not a hard ATS rule, just a
// steer, hence text-warning (amber) rather than text-error.
const BULLET_MIN_CHARS = 40;
const BULLET_MAX_CHARS = 150;

function BulletLengthHint({ text }: { text: string }) {
  const len = text.trim().length;
  if (len === 0) return null;
  const tooShort = len < BULLET_MIN_CHARS;
  const tooLong = len > BULLET_MAX_CHARS;
  return (
    <p className={`pl-0.5 font-mono text-[10px] tabular-nums ${tooShort || tooLong ? "text-warning" : "text-text-muted"}`}>
      {len} chars{tooShort ? " — a bit short for one line" : tooLong ? " — may wrap to two lines" : ""}
    </p>
  );
}

// AI never overwrites a bullet silently — this renders the pending
// suggestion as an Original-vs-Suggested diff the user has to explicitly
// accept, discard, or re-roll. Agent-teal, not accent amber: this is
// AI-generated content, and this app reserves agent-teal specifically for
// that (see ui-tokens.md's Match Score Colors section / ScoreGauge).
function BulletDiffCard({
  original,
  suggested,
  loading,
  onAccept,
  onDiscard,
  onTryAgain,
}: {
  original: string;
  suggested: string;
  loading: boolean;
  onAccept: () => void;
  onDiscard: () => void;
  onTryAgain: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-agent/30 bg-agent-light/50 p-2.5">
      <div className="flex items-start gap-1.5 text-[11px] leading-5 text-text-muted">
        <span className="mt-0.5 shrink-0 font-mono text-[9px] uppercase tracking-wide text-text-muted">Was</span>
        <span className="line-through decoration-text-muted/50">{original}</span>
      </div>
      <div className="flex items-start gap-1.5 text-xs leading-5 text-agent-dark">
        <span className="mt-0.5 shrink-0 font-mono text-[9px] uppercase tracking-wide text-agent">Now</span>
        {loading ? <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-agent" /> : <span>{suggested}</span>}
      </div>
      <div className="flex items-center gap-3 pt-0.5">
        <button
          type="button"
          disabled={loading}
          onClick={onAccept}
          className="inline-flex items-center gap-1 rounded-md bg-agent px-2.5 py-1 text-[11px] font-medium text-agent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3 w-3" /> Accept
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onTryAgain}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-agent disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" /> Try again
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onDiscard}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-error disabled:opacity-50"
        >
          <X className="h-3 w-3" /> Discard
        </button>
      </div>
    </div>
  );
}

// Shared by WorkEntryEditor and CustomEntryEditor — a small up/down mover,
// not a nested DndContext. Bullets already carry a lot of per-row ephemeral
// state (AI diff cards, instruction inputs, refs for keyboard focus); adding
// a THIRD level of drag-and-drop on top of section- and entry-level DND
// would multiply the nested-DND pitfalls agy's research flagged for
// comparatively little gain over two buttons — a deliberate scope call, not
// an oversight.
function MoveButtons({ onUp, onDown, disableUp, disableDown }: { onUp: () => void; onDown: () => void; disableUp: boolean; disableDown: boolean }) {
  return (
    <div className="mt-1 flex shrink-0 flex-col">
      <button
        type="button"
        onClick={onUp}
        disabled={disableUp}
        className="text-text-muted hover:text-accent disabled:pointer-events-none disabled:opacity-25"
        aria-label="Move up"
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={disableDown}
        className="text-text-muted hover:text-accent disabled:pointer-events-none disabled:opacity-25"
        aria-label="Move down"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  );
}

function WorkEntryEditor({
  onRewriteBullet,
  entry,
  focusTarget,
  dragHandle,
  onUpdate,
  onRemove,
  onDuplicate,
}: {
  onRewriteBullet: RewriteBulletFn;
  entry: TailoredWorkEntry;
  focusTarget?: FocusTarget | null;
  dragHandle: DragHandleProps;
  onUpdate: (patch: Partial<TailoredWorkEntry>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const [rewritingIndex, setRewritingIndex] = useState<number | null>(null);
  const [instructingIndex, setInstructingIndex] = useState<number | null>(null);
  const [instructionText, setInstructionText] = useState("");
  const [bulletError, setBulletError] = useState<{ index: number; message: string } | null>(null);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingSuggestion | null>(null);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);
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

  // Focuses a newly-created/just-vacated bullet after Enter/Backspace or
  // "Add bullet" — deferred via setTimeout(0), same reason as the other
  // effects in this file: the ref for a bullet added this render doesn't
  // exist until after commit, and this project's own
  // react-hooks/set-state-in-effect rule flags a direct setState in an
  // effect's synchronous body regardless.
  useEffect(() => {
    if (pendingFocusIndex === null) return;
    const timer = setTimeout(() => {
      const el = bulletRefs.current[pendingFocusIndex];
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
      setPendingFocusIndex(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [pendingFocusIndex]);

  // Never overwrites a bullet directly — the result becomes a `pending`
  // diff the user has to explicitly Accept, so "Edit with AI"/"Regenerate"
  // can't silently wreck a bullet's wording (research-pass pattern: AI
  // suggestions need an explicit compare-and-approve step, not a blind
  // slot machine).
  async function requestRewrite(j: number, instruction?: string) {
    setRewritingIndex(j);
    setBulletError(null);
    try {
      const original = pending?.index === j ? pending.original : entry.bullets[j];
      const result = await onRewriteBullet(entry.title, entry.company, original, instruction);
      if (result.success && result.text) {
        setPending({ index: j, original, suggested: result.text, instruction });
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

  function acceptPending() {
    if (!pending) return;
    onUpdate({ bullets: entry.bullets.map((b, idx) => (idx === pending.index ? pending.suggested : b)) });
    setPending(null);
  }

  function addBulletAfter(j: number) {
    onUpdate({ bullets: [...entry.bullets.slice(0, j + 1), "", ...entry.bullets.slice(j + 1)] });
    setPendingFocusIndex(j + 1);
  }

  function removeBulletAt(j: number) {
    if (entry.bullets.length <= 1) return;
    onUpdate({ bullets: entry.bullets.filter((_, idx) => idx !== j) });
    setPendingFocusIndex(Math.max(0, j - 1));
  }

  function moveBullet(j: number, dir: -1 | 1) {
    const target = j + dir;
    if (target < 0 || target >= entry.bullets.length) return;
    const next = [...entry.bullets];
    [next[j], next[target]] = [next[target], next[j]];
    onUpdate({ bullets: next });
  }

  function handleBulletKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, j: number, bullet: string) {
    const el = e.currentTarget;
    // Enter at the very end of a bullet spawns a new one below it, rather
    // than inserting a newline — bullets are meant to stay one line.
    // Shift+Enter (or Enter mid-text) still inserts a literal newline for
    // the rare case someone actually wants one.
    if (e.key === "Enter" && !e.shiftKey && el.selectionStart === bullet.length && el.selectionEnd === bullet.length) {
      e.preventDefault();
      addBulletAfter(j);
    } else if (e.key === "Backspace" && bullet.length === 0 && entry.bullets.length > 1) {
      e.preventDefault();
      removeBulletAt(j);
    }
  }

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="mb-3 flex items-start gap-2">
        <EntryDragHandle {...dragHandle} />
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          <FormInput value={entry.title} onChange={(v) => onUpdate({ title: v })} placeholder="Job title" />
          <FormInput value={entry.company} onChange={(v) => onUpdate({ company: v })} placeholder="Company" />
          <FormInput value={entry.start_date} onChange={(v) => onUpdate({ start_date: v })} placeholder="Start date (e.g. Jan 2022)" />
          <div className="flex items-center gap-2">
            {entry.is_current ? (
              <div className="flex h-9 flex-1 items-center rounded-lg border border-border bg-surface-secondary px-3 text-sm text-text-muted">
                Present
              </div>
            ) : (
              <FormInput value={entry.end_date ?? ""} onChange={(v) => onUpdate({ end_date: v })} placeholder="End date" />
            )}
            <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-text-muted">
              <input
                type="checkbox"
                checked={entry.is_current}
                onChange={(e) => onUpdate({ is_current: e.target.checked, end_date: e.target.checked ? null : entry.end_date })}
                className="h-3.5 w-3.5 accent-accent"
              />
              Current
            </label>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onDuplicate} className="text-text-muted hover:text-accent" aria-label="Duplicate this role">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onRemove} className="text-text-muted hover:text-error" aria-label="Remove this role">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {entry.bullets.map((bullet, j) => {
          const isPending = pending?.index === j;
          return (
            <div key={j} className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <textarea
                  ref={(el) => {
                    bulletRefs.current[j] = el;
                  }}
                  rows={2}
                  value={bullet}
                  disabled={isPending}
                  placeholder="Achieved [metric] by doing [action], resulting in [outcome]"
                  onChange={(e) => {
                    const next = entry.bullets.map((b, idx) => (idx === j ? e.target.value : b));
                    onUpdate({ bullets: next });
                  }}
                  onKeyDown={(e) => handleBulletKeyDown(e, j, bullet)}
                  className={`flex-1 resize-none rounded-lg border bg-transparent p-2 text-xs leading-5 text-text-primary outline-none transition-colors placeholder:text-text-muted/60 focus-visible:border-accent focus-visible:bg-surface disabled:opacity-60 ${
                    highlightIndex === j
                      ? "border-accent bg-surface ring-2 ring-accent/40"
                      : "border-transparent hover:border-border hover:bg-surface"
                  }`}
                />
                <MoveButtons
                  onUp={() => moveBullet(j, -1)}
                  onDown={() => moveBullet(j, 1)}
                  disableUp={j === 0}
                  disableDown={j === entry.bullets.length - 1}
                />
                <button
                  type="button"
                  onClick={() => removeBulletAt(j)}
                  disabled={entry.bullets.length <= 1}
                  className="mt-1 shrink-0 text-text-muted hover:text-error disabled:pointer-events-none disabled:opacity-30"
                  aria-label="Remove bullet"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>

              {!isPending && (
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
                    onClick={() => requestRewrite(j)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted transition-colors hover:text-accent disabled:opacity-50"
                  >
                    {rewritingIndex === j ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Regenerate
                  </button>
                </div>
              )}

              {instructingIndex === j && !isPending && (
                <div className="flex items-center gap-2 pl-0.5">
                  <input
                    autoFocus
                    value={instructionText}
                    onChange={(e) => setInstructionText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && instructionText.trim()) requestRewrite(j, instructionText.trim());
                    }}
                    placeholder="e.g. make it about leadership"
                    className="h-8 flex-1 rounded-lg border border-border bg-surface px-2 text-xs text-text-primary outline-none focus-visible:border-accent"
                  />
                  <button
                    type="button"
                    disabled={rewritingIndex === j || !instructionText.trim()}
                    onClick={() => requestRewrite(j, instructionText.trim())}
                    className="rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accent-foreground disabled:opacity-50"
                  >
                    Go
                  </button>
                </div>
              )}

              {isPending && (
                <BulletDiffCard
                  original={pending.original}
                  suggested={pending.suggested}
                  loading={rewritingIndex === j}
                  onAccept={acceptPending}
                  onDiscard={() => setPending(null)}
                  onTryAgain={() => requestRewrite(j, pending.instruction)}
                />
              )}

              {bulletError?.index === j && <p className="pl-0.5 text-[11px] text-error">{bulletError.message}</p>}
              {!isPending && <BulletLengthHint text={bullet} />}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => addBulletAfter(entry.bullets.length - 1)}
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
  dragHandle,
  onUpdate,
  onRemove,
  onDuplicate,
}: {
  entry: Education;
  dragHandle: DragHandleProps;
  onUpdate: (patch: Partial<Education>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 p-3">
      <EntryDragHandle {...dragHandle} />
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
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
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={onDuplicate} className="text-text-muted hover:text-accent" aria-label="Duplicate this entry">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onRemove} className="text-text-muted hover:text-error" aria-label="Remove this entry">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function CertificationEntryEditor({
  entry,
  dragHandle,
  onUpdate,
  onRemove,
  onDuplicate,
}: {
  entry: CertificationEntry;
  dragHandle: DragHandleProps;
  onUpdate: (patch: Partial<CertificationEntry>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 p-3">
      <EntryDragHandle {...dragHandle} />
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <FormLabel>Name</FormLabel>
          <FormInput value={entry.name} onChange={(v) => onUpdate({ name: v })} placeholder="AWS Certified Solutions Architect" />
        </div>
        <div>
          <FormLabel>Issuer</FormLabel>
          <FormInput value={entry.issuer} onChange={(v) => onUpdate({ issuer: v })} placeholder="Amazon Web Services" />
        </div>
        <div>
          <FormLabel>Date</FormLabel>
          <FormInput value={entry.date} onChange={(v) => onUpdate({ date: v })} placeholder="2024" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={onDuplicate} className="text-text-muted hover:text-accent" aria-label="Duplicate this entry">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onRemove} className="text-text-muted hover:text-error" aria-label="Remove this entry">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// Simpler sibling of WorkEntryEditor for user-defined custom sections —
// plain editable bullets with add/remove/move, deliberately WITHOUT the AI
// rewrite/diff flow: rewriteResumeBullet's prompt is tuned specifically for
// achievement-focused work-experience bullets, which doesn't fit an
// arbitrary custom entry the same way. A generic AI rewrite for custom
// content is a reasonable future add, not built here.
function CustomEntryEditor({
  entry,
  dragHandle,
  onUpdate,
  onRemove,
  onDuplicate,
}: {
  entry: CustomEntry;
  dragHandle: DragHandleProps;
  onUpdate: (patch: Partial<CustomEntry>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const bulletRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (pendingFocusIndex === null) return;
    const timer = setTimeout(() => {
      const el = bulletRefs.current[pendingFocusIndex];
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
      setPendingFocusIndex(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [pendingFocusIndex]);

  function addBulletAfter(j: number) {
    onUpdate({ bullets: [...entry.bullets.slice(0, j + 1), "", ...entry.bullets.slice(j + 1)] });
    setPendingFocusIndex(j + 1);
  }

  function removeBulletAt(j: number) {
    if (entry.bullets.length <= 1) return;
    onUpdate({ bullets: entry.bullets.filter((_, idx) => idx !== j) });
    setPendingFocusIndex(Math.max(0, j - 1));
  }

  function moveBullet(j: number, dir: -1 | 1) {
    const target = j + dir;
    if (target < 0 || target >= entry.bullets.length) return;
    const next = [...entry.bullets];
    [next[j], next[target]] = [next[target], next[j]];
    onUpdate({ bullets: next });
  }

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <div className="mb-3 flex items-start gap-2">
        <EntryDragHandle {...dragHandle} />
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
          <FormInput value={entry.title} onChange={(v) => onUpdate({ title: v })} placeholder="Title" />
          <FormInput value={entry.subtitle} onChange={(v) => onUpdate({ subtitle: v })} placeholder="Subtitle (issuer, role...)" />
          <FormInput value={entry.date} onChange={(v) => onUpdate({ date: v })} placeholder="Date" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onDuplicate} className="text-text-muted hover:text-accent" aria-label="Duplicate this entry">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onRemove} className="text-text-muted hover:text-error" aria-label="Remove this entry">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {entry.bullets.map((bullet, j) => (
          <div key={j} className="flex items-start gap-2">
            <textarea
              ref={(el) => {
                bulletRefs.current[j] = el;
              }}
              rows={2}
              value={bullet}
              placeholder="Describe this — what you did and the outcome"
              onChange={(e) => onUpdate({ bullets: entry.bullets.map((b, idx) => (idx === j ? e.target.value : b)) })}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                if (e.key === "Enter" && !e.shiftKey && el.selectionStart === bullet.length && el.selectionEnd === bullet.length) {
                  e.preventDefault();
                  addBulletAfter(j);
                } else if (e.key === "Backspace" && bullet.length === 0 && entry.bullets.length > 1) {
                  e.preventDefault();
                  removeBulletAt(j);
                }
              }}
              className="flex-1 resize-none rounded-lg border border-transparent bg-transparent p-2 text-xs leading-5 text-text-primary outline-none transition-colors placeholder:text-text-muted/60 hover:border-border hover:bg-surface focus-visible:border-accent focus-visible:bg-surface"
            />
            <MoveButtons
              onUp={() => moveBullet(j, -1)}
              onDown={() => moveBullet(j, 1)}
              disableUp={j === 0}
              disableDown={j === entry.bullets.length - 1}
            />
            <button
              type="button"
              onClick={() => removeBulletAt(j)}
              disabled={entry.bullets.length <= 1}
              className="mt-1 shrink-0 text-text-muted hover:text-error disabled:pointer-events-none disabled:opacity-30"
              aria-label="Remove bullet"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => addBulletAfter(entry.bullets.length - 1)}
          className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-accent hover:underline"
        >
          <Plus className="h-3 w-3" /> Add bullet
        </button>
      </div>
    </div>
  );
}
