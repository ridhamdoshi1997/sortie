"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  FileUp,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  deleteResume,
  getResumeProfileDiff,
  renameResume,
  setPrimaryResume,
  syncResumeToProfile,
  uploadResumeSlot,
  type ResumeRow,
  type SectionDiff,
} from "@/actions/resumes";
import { SYNC_SECTIONS, type SyncSection } from "@/lib/resumeSync";

const MAX_SLOTS = 5;

type Props = {
  initialResumes: ResumeRow[];
  // Optional — only meaningful when a ProfileForm is mounted on the same
  // page to notify. On /resume (its own route now), there's nothing to
  // notify; the résumé list itself already refreshes independently via
  // router.refresh() below, regardless of this callback.
  onSynced?: () => void;
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/* ------------------------------- actions menu -------------------------------- */

type MenuAction = "primary" | "sync" | "rename" | "export" | "delete";

function ActionsMenu({
  position,
  isPrimary,
  hasExtractedData,
  onAction,
  onClose,
}: {
  position: { top: number; left: number };
  isPrimary: boolean;
  hasExtractedData: boolean;
  onAction: (action: MenuAction) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Rendered via a portal, positioned from coordinates the trigger button's
  // own onClick handler already captured (getBoundingClientRect read in an
  // event handler, not a ref read during render/effect) — the table wrapper
  // needs overflow-x-auto for narrow screens, and per the CSS spec, setting
  // overflow-x to anything but visible forces the computed overflow-y to
  // auto too, which silently clips an absolutely-positioned dropdown
  // extending below the row (menu "opens" in React state but is invisible).
  // Portaling to document.body sidesteps that ancestor clipping entirely.
  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose]);

  const items: Array<{
    key: MenuAction;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tone?: "accent" | "agent" | "error";
    disabled?: boolean;
  }> = [
    { key: "primary", label: isPrimary ? "Already primary" : "Make primary", icon: Star, tone: "accent", disabled: isPrimary },
    { key: "sync", label: "Sync to profile", icon: RefreshCw, tone: "agent", disabled: !hasExtractedData },
    { key: "rename", label: "Edit details", icon: PencilLine },
    { key: "export", label: "Export PDF", icon: Download },
    { key: "delete", label: "Delete", icon: Trash2, tone: "error", disabled: isPrimary },
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: position.top, left: position.left }}
      className="animate-in fade-in-0 zoom-in-95 z-50 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-card duration-150"
    >
      {items.map(({ key, label, icon: Icon, tone, disabled }) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onAction(key)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            tone === "accent"
              ? "text-accent hover:bg-accent-muted"
              : tone === "agent"
                ? "text-agent hover:bg-agent-muted"
                : tone === "error"
                  ? "text-error hover:bg-error/10"
                  : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
          }`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/* -------------------------------- sync modal ---------------------------------- */

function SyncModal({
  resume,
  onClose,
  onDone,
}: {
  resume: ResumeRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<"loading" | "select" | "syncing" | "done" | "error">("loading");
  const [diffs, setDiffs] = useState<SectionDiff[]>([]);
  const [selected, setSelected] = useState<Set<SyncSection>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getResumeProfileDiff(resume.id).then((result) => {
      if (cancelled) return;
      if (result.success && result.diffs) {
        setDiffs(result.diffs);
        setSelected(new Set(result.diffs.filter((d) => d.hasChanges).map((d) => d.section)));
        setStage("select");
      } else {
        setError(result.error ?? "Failed to compare this résumé to your profile.");
        setStage("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resume.id]);

  function toggle(section: SyncSection) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  async function confirmSync() {
    setStage("syncing");
    const result = await syncResumeToProfile(resume.id, Array.from(selected));
    if (result.success) {
      setStage("done");
      onDone();
    } else {
      setError(result.error ?? "Failed to sync into profile.");
      setStage("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-panel-strong animate-in fade-in-0 zoom-in-95 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Sync to profile</h2>
            <p className="mt-0.5 text-xs text-text-muted">from &ldquo;{resume.name}&rdquo;</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {stage === "loading" && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          )}

          {stage === "error" && <p className="py-6 text-center text-sm text-error">{error}</p>}

          {(stage === "select" || stage === "syncing" || stage === "done") && (
            <>
              <p className="mb-4 text-sm text-text-secondary">
                Only new content gets added — nothing already in your profile is changed or removed.
              </p>
              <div className="space-y-3">
                {SYNC_SECTIONS.map((section) => {
                  const diff = diffs.find((d) => d.section === section);
                  const isSyncing = stage === "syncing" && selected.has(section);
                  const isDone = stage === "done" && selected.has(section);
                  return (
                    <div key={section} className="rounded-xl border border-border p-3.5">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(section)}
                          disabled={stage !== "select" || !diff?.hasChanges}
                          onChange={() => toggle(section)}
                          className="h-4 w-4 accent-accent"
                        />
                        <span className="flex-1 text-sm font-medium text-text-primary">{section}</span>
                        {isDone ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-success">
                            <Check className="h-3.5 w-3.5" /> Synced
                          </span>
                        ) : isSyncing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-agent" />
                        ) : diff?.hasChanges ? (
                          <span className="rounded-full bg-agent-muted px-2 py-0.5 text-[10px] font-medium text-agent">
                            {diff.summary.length} change{diff.summary.length === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="text-[11px] text-text-muted">Nothing new</span>
                        )}
                      </label>
                      {diff?.hasChanges && stage === "select" && (
                        <div className="mt-2.5 space-y-1 pl-7">
                          {diff.summary.map((line) => (
                            <p key={line} className="flex items-start gap-1.5 text-xs leading-5 text-agent-dark">
                              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                              {line}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          {stage === "select" && (
            <>
              <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary">
                Cancel
              </button>
              <button
                onClick={confirmSync}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Sync selected
              </button>
            </>
          )}
          {(stage === "done" || stage === "error") && (
            <button onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- rename modal ---------------------------------- */

function EditDetailsModal({ resume, onClose }: { resume: ResumeRow; onClose: () => void }) {
  const [name, setName] = useState(resume.name);
  const [persona, setPersona] = useState(resume.persona ?? "");
  const [targetJobTitle, setTargetJobTitle] = useState(resume.target_job_title ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const result = await renameResume(resume.id, {
      name: name.trim() || resume.name,
      persona: persona.trim() || null,
      targetJobTitle: targetJobTitle.trim() || null,
    });
    setSaving(false);
    if (result.success) onClose();
    else setError(result.error ?? "Failed to save.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-panel-strong animate-in fade-in-0 zoom-in-95 w-full max-w-md rounded-2xl duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-text-primary">Edit résumé details</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-secondary">
              <Tag className="h-3 w-3" /> Persona
            </label>
            <input
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="e.g. Enterprise Backend"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary">Target job title</label>
            <input
              value={targetJobTitle}
              onChange={(e) => setTargetJobTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- upload modal ---------------------------------- */

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("resume", file);
    const result = await uploadResumeSlot(formData);
    setUploading(false);
    if (result.success) {
      onUploaded();
      onClose();
    } else {
      setError(result.error ?? "Upload failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass-panel-strong animate-in fade-in-0 zoom-in-95 relative w-full max-w-md rounded-2xl p-8 text-center duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-xl font-bold text-text-primary">Add a résumé</h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={`mx-auto mt-6 flex h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors ${
            dragging ? "border-accent bg-accent-muted" : "border-border bg-surface-secondary"
          }`}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          ) : (
            <FileUp className={`h-6 w-6 ${dragging ? "text-accent" : "text-text-muted"}`} />
          )}
          <p className="text-xs text-text-muted">{uploading ? "Uploading and analysing…" : "Drop a file or click below"}</p>
        </div>
        <p className="mt-4 text-xs text-text-muted">PDF or LinkedIn profile PDF, up to 2MB.</p>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- manager table -------------------------------- */

export function ResumeManager({ initialResumes, onSynced }: Props) {
  const router = useRouter();
  const resumes = initialResumes;
  const [menuState, setMenuState] = useState<{ id: string; top: number; left: number } | null>(null);
  const [syncFor, setSyncFor] = useState<ResumeRow | null>(null);
  const [editFor, setEditFor] = useState<ResumeRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function handleAction(resume: ResumeRow, action: MenuAction) {
    setMenuState(null);
    if (action === "sync") return setSyncFor(resume);
    if (action === "rename") return setEditFor(resume);
    if (action === "export") {
      window.open(`/api/resumes/${resume.id}/download`, "_blank");
      return;
    }
    if (action === "primary") {
      setPendingAction(resume.id);
      await setPrimaryResume(resume.id);
      setPendingAction(null);
      refresh();
      return;
    }
    if (action === "delete") {
      if (!window.confirm(`Delete "${resume.name}"? This can't be undone.`)) return;
      setPendingAction(resume.id);
      const result = await deleteResume(resume.id);
      setPendingAction(null);
      if (!result.success) {
        window.alert(result.error ?? "Failed to delete résumé.");
      }
      refresh();
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-text-primary">
            {resumes.length} of {MAX_SLOTS}
          </span>{" "}
          résumé slots used
        </p>
        <button
          onClick={() => setUploadOpen(true)}
          disabled={resumes.length >= MAX_SLOTS}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add résumé
        </button>
      </div>

      {resumes.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm text-text-secondary">No résumés yet — upload one to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-surface-secondary">
                {["Résumé", "Target role", "Last modified", "Created", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resumes.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/resume/${r.id}`} className="font-medium text-text-primary hover:text-accent hover:underline">
                        {r.name}
                      </Link>
                      {r.is_primary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          <Star className="h-3 w-3" />
                          Primary
                        </span>
                      )}
                      <span className="rounded-full bg-success-lightest px-2 py-0.5 text-[10px] font-medium text-success-foreground">
                        {r.status === "analysed" ? "Analysed" : "Uploaded"}
                      </span>
                    </div>
                    {r.persona && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-text-muted">
                        <Tag className="h-3 w-3" />
                        {r.persona} persona
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-text-secondary">{r.target_job_title || "—"}</td>
                  <td className="px-5 py-4 font-mono text-xs tabular-nums text-text-muted">{formatRelative(r.updated_at)}</td>
                  <td className="px-5 py-4 font-mono text-xs tabular-nums text-text-muted">{formatRelative(r.created_at)}</td>
                  <td className="px-5 py-4 text-right">
                    {pendingAction === r.id ? (
                      <Loader2 className="ml-auto h-4 w-4 animate-spin text-text-muted" />
                    ) : (
                      <button
                        onClick={(e) => {
                          if (menuState?.id === r.id) {
                            setMenuState(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuState({ id: r.id, top: rect.bottom + 4, left: rect.right - 192 });
                        }}
                        className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    )}
                    {menuState?.id === r.id && (
                      <ActionsMenu
                        position={menuState}
                        isPrimary={r.is_primary}
                        hasExtractedData={!!r.extracted_data}
                        onClose={() => setMenuState(null)}
                        onAction={(action) => handleAction(r, action)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {syncFor && (
        <SyncModal
          resume={syncFor}
          onClose={() => setSyncFor(null)}
          onDone={() => {
            onSynced?.();
            refresh();
          }}
        />
      )}
      {editFor && (
        <EditDetailsModal
          resume={editFor}
          onClose={() => {
            setEditFor(null);
            refresh();
          }}
        />
      )}
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onUploaded={refresh} />}
    </div>
  );
}
