"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Loader2, RefreshCw } from "lucide-react";

import {
  analyzeResumeFit,
  analyzeTailoredResumeQuality,
  rewriteResumeBullet,
  saveResumeSections,
  saveResumeStyle,
} from "@/actions/documents";
import { AIRewriteTab } from "@/components/documents/AIRewriteTab";
import { EditorTab, type FocusTarget } from "@/components/documents/EditorTab";
import { EditorUsageMeter } from "@/components/documents/EditorUsageMeter";
import { StyleTab } from "@/components/documents/StyleTab";
import type { ScoreJumpResult } from "@/lib/scoreJump";
import type { Profile, ResumeAnalysis, ResumeGapAnalysisResult } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

// PDFViewer renders an iframe against browser-only PDF.js-style internals —
// this project's established pattern for browser-only rendering (see
// SettingsModalLoader's documented SSR/hydration history) is next/dynamic
// with ssr:false; called directly here since ResumeWorkspace is already a
// Client Component (the wrapper-file requirement only applies when dynamic()
// is called from a Server Component).
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
  jobId: string;
  profile: Profile;
  initialSections: ResumeSection[];
  initialStyle: ResumeStyle;
  initialResumeAnalysis: ResumeGapAnalysisResult | null;
  initialUpdatedAt: string | null;
  initialQualityAnalysis: ResumeAnalysis | null;
  initialQualityAnalyzedAt: string | null;
};

export function ResumeWorkspace({
  jobId,
  profile,
  initialSections,
  initialStyle,
  initialResumeAnalysis,
  initialUpdatedAt,
  initialQualityAnalysis,
  initialQualityAnalyzedAt,
}: Props) {
  const [sections, setSections] = useState(initialSections);
  const [style, setStyle] = useState(initialStyle);
  const [tab, setTab] = useState<"ai-rewrite" | "editor" | "style">("ai-rewrite");
  const [scoreJump, setScoreJump] = useState<ScoreJumpResult | null>(
    initialResumeAnalysis ? { ...initialResumeAnalysis, previousScore: null } : null,
  );
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [savingSections, setSavingSections] = useState(false);
  const [savingStyle, setSavingStyle] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [qualityAnalysis, setQualityAnalysis] = useState<ResumeAnalysis | null>(initialQualityAnalysis);
  const [qualityAnalyzedAt, setQualityAnalyzedAt] = useState(initialQualityAnalyzedAt);
  const [analyzingQuality, setAnalyzingQuality] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const sectionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ActionPlan (AI Rewrite tab) calls this when the user clicks a specific
  // flagged bullet — switches to the Editor tab and hands it a target to
  // scroll to/highlight, instead of making them hunt for it themselves.
  function focusBullet(company: string, bulletText: string) {
    setFocusTarget({ company, bulletText });
    setTab("editor");
  }

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    const result = await analyzeResumeFit(jobId, sections);
    setAnalyzing(false);
    if (result.success && result.scoreJump) {
      setScoreJump(result.scoreJump);
      return { success: true as const };
    }
    return { success: false as const, error: result.error };
  }, [jobId, sections]);

  // Deliberately separate from handleAnalyze above — this is the much more
  // expensive 10-dimension quality grade (3/day cap vs. the fit-check's
  // 15/day), so it's never auto-triggered on mount or on every small edit,
  // only on demand or right after a full Regenerate (see handleRegenerate).
  const handleAnalyzeQuality = useCallback(
    async (overrideSections?: ResumeSection[]) => {
      setAnalyzingQuality(true);
      const result = await analyzeTailoredResumeQuality(jobId, overrideSections ?? sections);
      setAnalyzingQuality(false);
      if (result.success && result.analysis) {
        setQualityAnalysis(result.analysis);
        setQualityAnalyzedAt(new Date().toISOString());
        return { success: true as const };
      }
      return { success: false as const, error: result.error };
    },
    [jobId, sections],
  );

  // Show a fit score by default rather than requiring a click — but only
  // once, on mount, and only if this résumé genuinely has never been scored
  // (jobs.resume_analysis is only ever populated as a side effect of a save/
  // regenerate/chat-revise, so a freshly-generated untouched résumé has none).
  // Deferred via setTimeout, not called synchronously in the effect body —
  // this project's own react-hooks/set-state-in-effect rule flags a direct
  // setState call in an effect's synchronous execution path (see
  // components/settings/SettingsModalLoader.tsx's own history of this).
  useEffect(() => {
    if (scoreJump) return;
    const timer = setTimeout(() => handleAnalyze(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitSections = useCallback(
    (next: ResumeSection[]) => {
      setSections(next);
      if (sectionsTimer.current) clearTimeout(sectionsTimer.current);
      sectionsTimer.current = setTimeout(async () => {
        setSavingSections(true);
        const result = await saveResumeSections(jobId, next);
        setSavingSections(false);
        if (result.success) {
          setUpdatedAt(new Date().toISOString());
          if (result.scoreJump) setScoreJump(result.scoreJump);
        }
      }, 900);
    },
    [jobId],
  );

  const commitStyle = useCallback(
    (next: ResumeStyle) => {
      setStyle(next);
      if (styleTimer.current) clearTimeout(styleTimer.current);
      styleTimer.current = setTimeout(async () => {
        setSavingStyle(true);
        const result = await saveResumeStyle(jobId, next);
        setSavingStyle(false);
        if (result.success) setUpdatedAt(new Date().toISOString());
      }, 500);
    },
    [jobId],
  );

  function handleRevised(data: { sections?: ResumeSection[]; style?: ResumeStyle; scoreJump?: ScoreJumpResult | null }) {
    if (data.sections) setSections(data.sections);
    if (data.style) setStyle(data.style);
    if (data.scoreJump) setScoreJump(data.scoreJump);
    setUpdatedAt(new Date().toISOString());
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, kind: "resume" }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { sections?: ResumeSection[]; style?: ResumeStyle; scoreJump?: ScoreJumpResult | null };
      };
      if (json.success && json.data) {
        handleRevised(json.data);
        // Only if a quality grade already existed — regenerating shouldn't
        // silently spend a 3/day-capped credit on someone who never asked
        // for a quality grade in the first place. Pass the fresh sections
        // explicitly — setSections above is async, so this closure's own
        // `sections` would still be stale if relied on here.
        if (qualityAnalysis && json.data.sections) handleAnalyzeQuality(json.data.sections);
      }
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="fade-in-up overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Résumé workspace</h3>
          <p className="font-mono text-[11px] text-text-muted">
            {savingSections || savingStyle ? "Saving…" : `Updated ${formatRelative(updatedAt)}`}
          </p>
        </div>
        <EditorUsageMeter action="document_generation" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="border-b border-border bg-surface-secondary p-6 lg:border-b-0 lg:border-r">
          <ResumeLivePreview profile={profile} sections={sections} style={style} />
        </div>

        <div className="flex flex-col">
          {/* Underline, not a filled pill (2026-08-26, same fix as
             components/ui/Tabs.tsx) — `bg-accent-muted` resolves to
             `#2c1a08` in dark mode, the identical muddy-fill bug already
             fixed there; a border-bottom in `--color-accent` stays vivid
             in both themes. */}
          <div className="flex gap-1 border-b border-border p-3">
            {(
              [
                { key: "ai-rewrite", label: "AI Rewrite" },
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
          {/* Keyed on `tab` so a tab switch remounts this wrapper and
             replays the entrance animation — a real state transition
             (switching panels), not decoration for its own sake. */}
          <div key={tab} className="animate-in fade-in-0 slide-in-from-bottom-1 max-h-[560px] overflow-y-auto p-5 duration-200">
            {tab === "ai-rewrite" && (
              <AIRewriteTab
                jobId={jobId}
                scoreJump={scoreJump}
                analyzing={analyzing}
                onAnalyze={handleAnalyze}
                qualityAnalysis={qualityAnalysis}
                qualityAnalyzedAt={qualityAnalyzedAt}
                analyzingQuality={analyzingQuality}
                onAnalyzeQuality={handleAnalyzeQuality}
                onFocusBullet={focusBullet}
                onRevised={handleRevised}
                style={style}
                sections={sections}
                contact={{ email: profile.email, phone: profile.phone, location: profile.location }}
              />
            )}
            {tab === "editor" && (
              <EditorTab
                sections={sections}
                onChange={commitSections}
                onRewriteBullet={(title, company, text, instruction) =>
                  rewriteResumeBullet(jobId, title, company, text, instruction)
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
          href={`/api/documents/download?jobId=${jobId}&kind=resume`}
          target="_blank"
          rel="noreferrer"
          className="btn-signal inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-accent-foreground"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface disabled:opacity-60"
        >
          {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 text-accent" />}
          Regenerate
        </button>
      </div>
    </div>
  );
}
