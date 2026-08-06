"use client";

import { useState } from "react";
import { Gauge, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { ActionPlan } from "@/components/documents/ActionPlan";
import { DocumentChatEditor } from "@/components/documents/DocumentChatEditor";
import { QualityGradeCard } from "@/components/documents/QualityGradeCard";
import { RefinementChips } from "@/components/documents/RefinementChips";
import type { ScoreJumpResult } from "@/lib/scoreJump";
import type { ResumeAnalysis } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

function scoreLabel(score: number): string {
  if (score >= 8) return "Excellent";
  if (score >= 6) return "Good";
  if (score >= 4) return "Needs work";
  return "Weak";
}

function ScoreGauge({ score }: { score: number }) {
  const pct = Math.min(1, Math.max(0, score / 10));
  const r = 60;
  const circumference = Math.PI * r;
  const dash = circumference * pct;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div className="relative h-20 w-36">
        <svg width="144" height="80" viewBox="0 0 144 80" className="absolute inset-0">
          <path
            d="M 12 72 A 60 60 0 0 1 132 72"
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 12 72 A 60 60 0 0 1 132 72"
            fill="none"
            stroke="var(--color-agent)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          <p className="text-2xl font-bold text-text-primary">{score.toFixed(1)}</p>
        </div>
      </div>
      <span className="rounded-full bg-agent-light px-2.5 py-0.5 text-[11px] font-semibold text-agent-dark">
        {scoreLabel(score)}
      </span>
    </div>
  );
}

type RevisedData = { reply?: string; sections?: ResumeSection[]; style?: ResumeStyle; scoreJump?: ScoreJumpResult | null };

type Props = {
  jobId: string;
  scoreJump: ScoreJumpResult | null;
  analyzing: boolean;
  onAnalyze: () => Promise<{ success: boolean; error?: string }>;
  qualityAnalysis: ResumeAnalysis | null;
  qualityAnalyzedAt: string | null;
  analyzingQuality: boolean;
  onAnalyzeQuality: () => Promise<{ success: boolean; error?: string }>;
  onFocusBullet: (company: string, bulletText: string) => void;
  onRevised: (data: RevisedData) => void;
};

// The mockup/reference for this tab groups the score, the changelog, one-tap
// refinement chips, and the free-form chat into a single "AI Rewrite" tab
// rather than a permanently-visible strip under Editor/Style — matches a
// real competitor's layout the user pointed to live. "See what's changed"
// only ever shows keyword deltas actually returned by the gap analysis, not
// a fabricated edit-history list — this app doesn't track that, and
// inventing one would misrepresent what actually happened.
//
// analyzing/onAnalyze are lifted to ResumeWorkspace rather than owned here —
// the same handler also fires once automatically on workspace mount (so a
// score shows by default, not just after a manual click), and it needs the
// live `sections` state, not whatever was true when this tab last rendered.
export function AIRewriteTab({
  jobId,
  scoreJump,
  analyzing,
  onAnalyze,
  qualityAnalysis,
  qualityAnalyzedAt,
  analyzingQuality,
  onAnalyzeQuality,
  onFocusBullet,
  onRevised,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);

  async function handleAnalyzeClick() {
    setError(null);
    const result = await onAnalyze();
    if (!result.success) setError(result.error ?? "Failed to check your fit score.");
  }

  async function handleAnalyzeQualityClick() {
    setQualityError(null);
    const result = await onAnalyzeQuality();
    if (!result.success) setQualityError(result.error ?? "Failed to grade this résumé.");
  }

  return (
    <div className="flex flex-col gap-4">
      {scoreJump ? (
        <div className="flex items-center gap-4 rounded-xl bg-surface-secondary p-4">
          <ScoreGauge score={scoreJump.score} />
          <div className="flex-1">
            {scoreJump.previousScore != null ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <Sparkles className="h-4 w-4 shrink-0 text-agent" />
                Score jumped from {scoreJump.previousScore.toFixed(1)} to {scoreJump.score.toFixed(1)}
              </p>
            ) : (
              <p className="text-sm font-medium text-text-primary">Fit score for this job</p>
            )}
            {scoreJump.matchedKeywords.length > 0 && (
              <p className="mt-1 text-xs text-text-muted">
                {scoreJump.matchedKeywords.length} keyword{scoreJump.matchedKeywords.length === 1 ? "" : "s"} matched
                {scoreJump.missingKeywords.length > 0 && ` · still missing: ${scoreJump.missingKeywords.slice(0, 3).join(", ")}`}
              </p>
            )}
            <button
              type="button"
              disabled={analyzing}
              onClick={handleAnalyzeClick}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {analyzing ? "Re-checking…" : "Re-check score"}
            </button>
            {error && <p className="mt-1 text-[11px] text-error">{error}</p>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface-secondary p-6 text-center">
          <Gauge className="h-6 w-6 text-text-muted" />
          <div>
            <p className="text-sm font-medium text-text-primary">{analyzing ? "Checking your fit score…" : "No fit score yet"}</p>
            {!analyzing && (
              <p className="mt-0.5 text-xs text-text-muted">
                See how well this résumé matches the job — and watch the score move as you edit or ask AI to refine it.
              </p>
            )}
          </div>
          {!analyzing && (
            <button
              type="button"
              onClick={handleAnalyzeClick}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              <Gauge className="h-3.5 w-3.5" />
              Check my fit score
            </button>
          )}
          {analyzing && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      )}

      <div>
        <QualityGradeCard
          analysis={qualityAnalysis}
          analyzedAt={qualityAnalyzedAt}
          analyzing={analyzingQuality}
          onRefresh={handleAnalyzeQualityClick}
        />
        {qualityError && <p className="mt-1 text-[11px] text-error">{qualityError}</p>}
      </div>

      <ActionPlan
        jobId={jobId}
        scoreJump={scoreJump}
        qualityAnalysis={qualityAnalysis}
        onFocusBullet={onFocusBullet}
        onRevised={onRevised}
      />

      <div>
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">Quick tweaks</p>
        <RefinementChips jobId={jobId} onRevised={onRevised} />
      </div>

      <DocumentChatEditor jobId={jobId} kind="resume" onRevised={onRevised} />
    </div>
  );
}
