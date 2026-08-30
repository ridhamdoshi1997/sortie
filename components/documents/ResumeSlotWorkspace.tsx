"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, FileText } from "lucide-react";

import { analyzeResume, rewriteResumeSlotBullet, saveResumeSlotSections, saveResumeSlotStyle } from "@/actions/resumes";
import { EditorTab, type FocusTarget } from "@/components/documents/EditorTab";
import { StyleTab } from "@/components/documents/StyleTab";
import { QualityGradeCard } from "@/components/documents/QualityGradeCard";
import { ATSAuditCard } from "@/components/documents/ATSAuditCard";
import type { Profile, ResumeAnalysis } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

// Résumé-slot counterpart to ResumeWorkspace.tsx (tailored per-job résumés) —
// same Editor/Style tabs and the same underlying components (EditorTab,
// StyleTab, ATSAuditCard are already data-source-agnostic, operating on
// plain ResumeSection[]/ResumeStyle). Two real, deliberate differences from
// the tailored version, not oversights:
//   1. No job-specific fit-score gauge, "Regenerate", quick-tweak chips, or
//      AI chat editor — those are all fundamentally about revising a résumé
//      against ONE job posting's requirements, which doesn't exist for a
//      general-purpose uploaded résumé. Building job-agnostic equivalents
//      would be new AI-feature scope (usage caps, prompt design, streaming
//      chat UI), not "give this the same options."
//   2. The whole-résumé Quality Grade (analyzeResume) already existed for
//      résumé slots before this feature — surfaced here inside the
//      workspace, same as it is for tailored résumés, instead of only in
//      ResumeAnalysisView's read-only report.
const ResumeLivePreview = dynamic(
  () => import("@/components/documents/ResumeLivePreview").then((m) => m.ResumeLivePreview),
  { ssr: false, loading: () => <PreviewSkeleton /> },
);

function PreviewSkeleton() {
  return (
    <div className="flex h-[700px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-text-muted">
      Loading preview…
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

type Props = {
  resumeId: string;
  profile: Profile;
  initialSections: ResumeSection[];
  initialStyle: ResumeStyle;
  initialAnalysis: ResumeAnalysis | null;
  initialAnalyzedAt: string | null;
  initialSectionsUpdatedAt: string | null;
};

export function ResumeSlotWorkspace({
  resumeId,
  profile,
  initialSections,
  initialStyle,
  initialAnalysis,
  initialAnalyzedAt,
  initialSectionsUpdatedAt,
}: Props) {
  const [sections, setSections] = useState(initialSections);
  const [style, setStyle] = useState(initialStyle);
  const [tab, setTab] = useState<"insights" | "editor" | "style">("insights");
  const [updatedAt, setUpdatedAt] = useState(initialSectionsUpdatedAt);
  // Until the first real edit is saved, resumes.sections is still null in
  // the DB — initialSections here is only a client-side reconstruction
  // built from extracted_data (see buildSectionsFromExtractedData), and
  // bullet-splitting/restructuring that reconstruction from a flat text
  // blob is a lossy heuristic. Showing that as the preview before the user
  // has asked to edit anything would silently substitute an approximation
  // for the real file they uploaded — so the preview pane shows the actual
  // original PDF first, and only switches to the live editable render once
  // a real edit has actually been saved.
  const [hasStartedEditing, setHasStartedEditing] = useState(initialSectionsUpdatedAt !== null);
  // Which document the preview pane shows once editing has started — a
  // small in-place toggle, not a link that navigates away to a new tab, so
  // switching back to the real source file never leaves the workspace.
  const [previewView, setPreviewView] = useState<"live" | "original">("live");
  const [savingSections, setSavingSections] = useState(false);
  const [savingStyle, setSavingStyle] = useState(false);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(initialAnalysis);
  const [analyzedAt, setAnalyzedAt] = useState(initialAnalyzedAt);
  const [analyzing, setAnalyzing] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const sectionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    const result = await analyzeResume(resumeId);
    setAnalyzing(false);
    if (result.success && result.analysis) {
      setAnalysis(result.analysis);
      setAnalyzedAt(new Date().toISOString());
    }
  }, [resumeId]);

  const commitSections = useCallback(
    (next: ResumeSection[]) => {
      setSections(next);
      if (sectionsTimer.current) clearTimeout(sectionsTimer.current);
      sectionsTimer.current = setTimeout(async () => {
        setSavingSections(true);
        const result = await saveResumeSlotSections(resumeId, next);
        setSavingSections(false);
        if (result.success) {
          setUpdatedAt(new Date().toISOString());
          setHasStartedEditing(true);
        }
      }, 900);
    },
    [resumeId],
  );

  const commitStyle = useCallback(
    (next: ResumeStyle) => {
      setStyle(next);
      if (styleTimer.current) clearTimeout(styleTimer.current);
      styleTimer.current = setTimeout(async () => {
        setSavingStyle(true);
        const result = await saveResumeSlotStyle(resumeId, next);
        setSavingStyle(false);
        if (result.success) {
          setUpdatedAt(new Date().toISOString());
          setHasStartedEditing(true);
        }
      }, 500);
    },
    [resumeId],
  );

  return (
    <div className="fade-in-up overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Edit & style</h3>
          <p className="font-mono text-[11px] text-text-muted">
            {savingSections || savingStyle ? "Saving…" : `Updated ${formatRelative(updatedAt)}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="border-b border-border bg-surface-secondary p-6 lg:border-b-0 lg:border-r">
          {hasStartedEditing ? (
            <div className="flex flex-col gap-3">
              <div className="flex w-fit gap-1 rounded-full border border-border bg-surface p-1">
                {(
                  [
                    { key: "live", label: "Live edit" },
                    { key: "original", label: "Original upload" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreviewView(key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      previewView === key ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {previewView === "live" ? (
                <ResumeLivePreview profile={profile} sections={sections} style={style} />
              ) : (
                <iframe
                  src={`/api/resumes/${resumeId}/download?original=1`}
                  title="Original uploaded résumé"
                  className="h-[700px] w-full rounded-lg border border-border bg-surface"
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-secondary p-3.5">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
                <p className="text-xs leading-5 text-text-secondary">
                  <strong className="text-text-primary">This is the original file you uploaded.</strong> The Editor tab has an editable copy
                  ready to go — the preview switches to your live edits as soon as you change something there.
                </p>
              </div>
              <iframe
                src={`/api/resumes/${resumeId}/download`}
                title="Original uploaded résumé"
                className="h-[700px] w-full rounded-lg border border-border bg-surface"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex gap-1 border-b border-border p-3">
            {(
              [
                { key: "insights", label: "Insights" },
                { key: "editor", label: "Editor" },
                { key: "style", label: "Style" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex-1 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  tab === key
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Keyed on `tab` — see ResumeWorkspace.tsx's own comment on this
             same pattern. */}
          <div key={tab} className="animate-in fade-in-0 slide-in-from-bottom-1 max-h-[560px] overflow-y-auto p-5 duration-200">
            {tab === "insights" && (
              <div className="flex flex-col gap-4">
                <ATSAuditCard
                  style={style}
                  sections={sections}
                  contact={{ email: profile.email, phone: profile.phone, location: profile.location }}
                  matchedKeywords={[]}
                  missingKeywords={[]}
                  noKeywordDataHint="Keyword match isn't available here — this résumé isn't tied to a specific job. Tailor it to a job from the Find & Evaluate page to get a keyword-match score."
                />
                <QualityGradeCard
                  analysis={analysis}
                  analyzedAt={analyzedAt}
                  analyzing={analyzing}
                  onRefresh={handleAnalyze}
                />
              </div>
            )}
            {tab === "editor" && (
              <EditorTab
                sections={sections}
                onChange={commitSections}
                onRewriteBullet={(title, company, text, instruction) =>
                  rewriteResumeSlotBullet(resumeId, title, company, text, instruction)
                }
                focusTarget={focusTarget}
                onFocusHandled={() => setFocusTarget(null)}
              />
            )}
            {tab === "style" && <StyleTab style={style} onChange={commitStyle} />}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border bg-surface-secondary p-5">
        <a
          href={`/api/resumes/${resumeId}/download`}
          target="_blank"
          rel="noreferrer"
          className="btn-signal inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-accent-foreground"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
        <a
          href={`/api/resumes/${resumeId}/download-docx`}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface"
        >
          <Download className="h-4 w-4" />
          Download DOCX
        </a>
        <a
          href={`/api/resumes/${resumeId}/download-markdown`}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface"
        >
          <Download className="h-4 w-4" />
          Download Markdown
        </a>
      </div>
    </div>
  );
}
