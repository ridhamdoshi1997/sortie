"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ClipboardList,
  Download,
  Layers,
  Loader2,
  PencilLine,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { analyzeResume, applyResumeBulletFix, deleteResume, renameResume, type ResumeRow } from "@/actions/resumes";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ResumeAnalysis, ResumeBulletIssue, ResumeSectionAnalysis } from "@/types";

// Identifies a section without holding a stale snapshot of it — the drill-
// down looks up the live section from `analysis.sections` by this key on
// every render, so when a fix removes a bullet the sidebar/list update
// immediately instead of needing the modal to be closed and reopened.
type SectionKey = { section: ResumeSectionAnalysis["section"]; entryCompany?: string };

function sectionKeyOf(s: ResumeSectionAnalysis): SectionKey {
  return { section: s.section, entryCompany: s.entryCompany };
}

function findSection(analysis: ResumeAnalysis | null, key: SectionKey | null): ResumeSectionAnalysis | null {
  if (!analysis || !key) return null;
  return analysis.sections.find((s) => s.section === key.section && s.entryCompany === key.entryCompany) ?? null;
}

type Grade = "A" | "B" | "C" | "D" | "F";

// Same palette EvaluationBreakdown.tsx already established for AI-generated
// letter grades — agent-teal for the good end, warning/error for the
// concerning end, never accent (that's reserved for user actions per
// ui-tokens.md). Reused verbatim rather than re-derived, since this is the
// exact same "AI evaluation output" concept, just for a résumé instead of a
// job match.
const GRADE_BADGE: Record<Grade, string> = {
  A: "bg-agent text-agent-foreground",
  B: "bg-agent-light text-agent-dark",
  C: "bg-surface-secondary text-text-secondary",
  D: "bg-warning/10 text-warning",
  F: "bg-error text-error-foreground",
};

const SEVERITY_STYLES = {
  urgent: { label: "Urgent", badge: "bg-error/10 text-error" },
  critical: { label: "Critical", badge: "bg-warning/10 text-warning" },
  optional: { label: "Optional", badge: "bg-surface-secondary text-text-secondary" },
} as const;

const SECTION_LABELS: Record<ResumeSectionAnalysis["section"], string> = {
  personal: "Personal Info",
  professional_summary: "Professional Summary",
  skills: "Skills",
  work_experience: "Work Experience",
  education: "Education",
};

function GradeBadge({ grade, label, size = "lg" }: { grade: Grade; label: string; size?: "lg" | "sm" }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex shrink-0 items-center justify-center rounded-2xl font-mono font-bold ${GRADE_BADGE[grade]} ${
          size === "lg" ? "h-14 w-14 text-2xl" : "h-9 w-9 text-sm"
        }`}
      >
        {grade}
      </span>
      {size === "lg" && (
        <span className="rounded-full bg-agent-muted px-3 py-1 text-xs font-semibold uppercase tracking-wide text-agent">
          {label}
        </span>
      )}
    </div>
  );
}

function IssueCountPill({ label, count, tone }: { label: string; count: number; tone: "error" | "warning" | "muted" }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border px-4 py-2.5">
      <span
        className={`text-xl font-bold ${
          tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "text-text-secondary"
        }`}
      >
        {count}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
    </div>
  );
}

/* ------------------------------ bullet drill-down ------------------------------ */

function BulletDrillDown({
  resumeId,
  sectionKey,
  section,
  onClose,
  onApplied,
}: {
  resumeId: string;
  sectionKey: SectionKey;
  // Looked up live from the parent's analysis state every render — shrinks
  // (and the sidebar/counts with it) the instant a fix is saved, no need to
  // re-run analysis or close/reopen this modal to see it reflected.
  section: ResumeSectionAnalysis | null;
  onClose: () => void;
  onApplied: (key: SectionKey, bullet: ResumeBulletIssue) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [seenBulletKey, setSeenBulletKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = section?.bulletIssues[activeIndex] ?? null;

  // Reset the draft when the active bullet changes — adjusted during render
  // rather than in an effect (React's own recommended pattern for this
  // exact "derive local state from a changing prop" case), so there's no
  // extra render-then-effect flash of the previous bullet's draft text.
  if (active && active.originalText !== seenBulletKey) {
    setSeenBulletKey(active.originalText);
    setDraft(active.suggestedRewrite);
  }

  // Every bullet in this section got fixed — nothing left to show, close
  // automatically rather than leaving an empty modal open.
  useEffect(() => {
    if (section && section.bulletIssues.length === 0) onClose();
  }, [section, onClose]);

  if (!section || !active) return null;

  function applyFix() {
    if (!section!.entryCompany || !active) return;
    setError(null);
    startTransition(async () => {
      const result = await applyResumeBulletFix(resumeId, section!.entryCompany!, active.originalText, draft);
      if (result.success) {
        onApplied(sectionKey, active);
        setActiveIndex(0);
      } else {
        setError(result.error ?? "Failed to save this change.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="glass-panel-strong flex max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex w-48 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3">
          <p className="mb-1 px-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">
            {SECTION_LABELS[section.section]}
            {section.entryCompany ? ` · ${section.entryCompany}` : ""}
          </p>
          {section.bulletIssues.map((b, i) => (
            <button
              key={b.originalText}
              onClick={() => setActiveIndex(i)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                i === activeIndex ? "bg-accent-muted text-accent" : "text-text-secondary hover:bg-surface-secondary"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  SEVERITY_STYLES[section.severity].badge.includes("error") ? "bg-error" : "bg-warning"
                }`}
              />
              Bullet {i + 1}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">
              {SECTION_LABELS[section.section]}
              {section.entryCompany ? ` at ${section.entryCompany}` : ""}
            </h2>
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                <ClipboardList className="h-3 w-3" /> Original
              </p>
              <p className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-sm text-text-secondary">
                {active.originalText}
              </p>
            </div>

            <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning">
                <AlertTriangle className="h-3.5 w-3.5" /> {active.issueType}
              </p>
              <p className="mb-2 text-sm text-text-primary">
                <strong>Issue detected: </strong>
                {active.issueDetected}
              </p>
              <p className="mb-2 text-xs leading-5 text-text-secondary">
                <strong>Why this matters: </strong>
                {active.whyItMatters}
              </p>
              <p className="text-xs leading-5 text-text-secondary">
                <strong>How to improve: </strong>
                {active.howToImprove}
              </p>
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-agent">
                <Sparkles className="h-3 w-3" /> AI-suggested rewrite
              </p>
              <p className="rounded-lg bg-agent-light px-3 py-2.5 text-sm text-agent-dark">{active.suggestedRewrite}</p>
            </div>

            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">Write your new version</p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {error && <p className="text-xs text-error">{error}</p>}

            <div className="flex justify-end">
              <button
                onClick={applyFix}
                disabled={isPending}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save this version
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- main view --------------------------------- */

function EditResumeInfoModal({
  resume,
  onClose,
  onSaved,
}: {
  resume: ResumeRow;
  onClose: () => void;
  onSaved: (name: string, targetJobTitle: string | null) => void;
}) {
  const [name, setName] = useState(resume.name);
  const [targetJobTitle, setTargetJobTitle] = useState(resume.target_job_title ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!name.trim()) {
      setError("Résumé name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await renameResume(resume.id, { name: name.trim(), targetJobTitle: targetJobTitle.trim() || null });
      if (result.success) {
        onSaved(name.trim(), targetJobTitle.trim() || null);
        onClose();
      } else {
        setError(result.error ?? "Failed to update résumé.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div
        className="glass-panel-strong w-full max-w-md rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Edit Resume Info</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary">Résumé Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary">Target Job Title</label>
            <input
              value={targetJobTitle}
              onChange={(e) => setTargetJobTitle(e.target.value)}
              placeholder="e.g. Product Manager"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Update
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResumeAnalysisView({ resume: initialResume }: { resume: ResumeRow }) {
  const router = useRouter();
  const [resume, setResume] = useState(initialResume);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(initialResume.analysis);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [drillDownKey, setDrillDownKey] = useState<SectionKey | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const liveDrillDownSection = findSection(analysis, drillDownKey);

  function runAnalysis() {
    setError(null);
    startTransition(async () => {
      const result = await analyzeResume(resume.id);
      if (result.success && result.analysis) {
        setAnalysis(result.analysis);
      } else {
        setError(result.error ?? "Failed to analyze this résumé.");
      }
    });
  }

  // Removes the just-fixed bullet from local state immediately — the whole
  // point raised in feedback: a saved fix should visibly reduce the
  // urgent/critical/optional counts and shrink the flagged list right away,
  // not require spending another Re-Analyze credit just to see it reflected.
  function markBulletFixed(key: SectionKey, bullet: ResumeBulletIssue) {
    setAnalysis((prev) => {
      if (!prev) return prev;
      const nextSections = prev.sections
        .map((s) =>
          s.section === key.section && s.entryCompany === key.entryCompany
            ? { ...s, bulletIssues: s.bulletIssues.filter((b) => b.originalText !== bullet.originalText) }
            : s,
        )
        .filter((s) => s.bulletIssues.length > 0);
      const countBy = (severity: (typeof nextSections)[number]["severity"]) =>
        nextSections.filter((s) => s.severity === severity).length;
      return {
        ...prev,
        sections: nextSections,
        urgentCount: countBy("urgent"),
        criticalCount: countBy("critical"),
        optionalCount: countBy("optional"),
      };
    });
  }

  function handleDelete() {
    setDeleteConfirmOpen(true);
  }

  function handleConfirmDelete() {
    startDeleteTransition(async () => {
      const result = await deleteResume(resume.id);
      setDeleteConfirmOpen(false);
      if (result.success) {
        router.push("/resume");
      } else {
        setError(result.error ?? "Failed to delete résumé.");
      }
    });
  }

  if (!resume.extracted_data) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
        <p className="text-sm text-text-secondary">
          This résumé hasn&apos;t been processed yet — re-upload it from the résumé manager first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2 border-b border-border pb-4">
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-secondary"
          >
            <PencilLine className="h-3.5 w-3.5" /> Edit Resume Info
          </button>
          <a
            href={`/api/resumes/${resume.id}/download`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-secondary"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </a>
          <button
            onClick={handleDelete}
            disabled={isDeleting || resume.is_primary}
            title={resume.is_primary ? "Set another résumé as primary before deleting this one" : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {analysis ? (
              <GradeBadge grade={analysis.grade} label={analysis.gradeLabel} />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border text-text-muted">
                <Layers className="h-5 w-5" />
              </span>
            )}
            <div>
              <p className="text-lg font-bold text-text-primary">{resume.name}</p>
              {resume.target_job_title && <p className="text-xs text-text-secondary">{resume.target_job_title}</p>}
              <p className="text-xs text-text-muted">
                {analysis ? "Analyzed" : "Not yet analyzed"}
                {resume.analyzed_at && ` · ${new Date(resume.analyzed_at).toLocaleString()}`}
              </p>
            </div>
          </div>

          <button
            onClick={runAnalysis}
            disabled={isPending}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isPending ? "Analyzing…" : analysis ? "Re-Analyze" : "Analyze Résumé"}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-error">{error}</p>}

        {analysis && (
          <div className="mt-5 flex flex-wrap gap-3">
            <IssueCountPill label="Urgent" count={analysis.urgentCount} tone="error" />
            <IssueCountPill label="Critical" count={analysis.criticalCount} tone="warning" />
            <IssueCountPill label="Optional" count={analysis.optionalCount} tone="muted" />
          </div>
        )}
      </div>

      {analysis && (
        <>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <h2 className="mb-2 text-sm font-semibold text-text-primary">Analysis Summary</h2>
            <p className="text-sm leading-6 text-text-secondary">{analysis.summary}</p>
          </div>

          <div className="rounded-2xl border border-agent/30 bg-agent-light p-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-agent-dark">
              <Sparkles className="h-4 w-4" /> Strategic Narrative
            </h2>
            <p className="text-sm leading-6 text-agent-dark">{analysis.narrativeInsight}</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <h2 className="mb-4 text-sm font-semibold text-text-primary">10-Dimension Role-Fit Matrix</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {analysis.dimensions.map((d) => (
                <div key={d.dimension} className="flex items-start gap-3 rounded-xl border border-border p-3.5">
                  <GradeBadge grade={d.grade} label="" size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{d.dimension}</p>
                    <p className="text-xs leading-5 text-text-secondary">{d.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {analysis.vulnerabilities.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <ShieldAlert className="h-4 w-4 text-warning" /> Interviewer Skepticism
              </h2>
              <p className="mb-4 text-xs text-text-muted">
                Not résumé issues — things a sharp interviewer would probe. Prepare your answer, don&apos;t necessarily edit
                the résumé.
              </p>
              <div className="space-y-3">
                {analysis.vulnerabilities.map((v) => (
                  <div key={v.title} className="rounded-xl border border-warning/30 bg-warning/5 p-3.5">
                    <p className="text-sm font-semibold text-text-primary">{v.title}</p>
                    <p className="text-xs leading-5 text-text-secondary">{v.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.sections.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
              <h2 className="mb-4 text-sm font-semibold text-text-primary">Flagged Sections</h2>
              <div className="space-y-2">
                {analysis.sections.map((s) => (
                  <div
                    key={`${s.section}-${s.entryCompany ?? ""}`}
                    className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {SECTION_LABELS[s.section]}
                        {s.entryCompany ? ` · ${s.entryCompany}` : ""}
                      </p>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLES[s.severity].badge}`}>
                        {SEVERITY_STYLES[s.severity].label} · {s.bulletIssues.length} issue{s.bulletIssues.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <button
                      onClick={() => setDrillDownKey(sectionKeyOf(s))}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90"
                    >
                      FIX
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {drillDownKey && (
        <BulletDrillDown
          resumeId={resume.id}
          sectionKey={drillDownKey}
          section={liveDrillDownSection}
          onClose={() => setDrillDownKey(null)}
          onApplied={markBulletFixed}
        />
      )}

      {editOpen && (
        <EditResumeInfoModal
          resume={resume}
          onClose={() => setEditOpen(false)}
          onSaved={(name, targetJobTitle) => setResume((r) => ({ ...r, name, target_job_title: targetJobTitle }))}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete résumé?"
        description={`Delete "${resume.name}"? This can't be undone.`}
        pending={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}
