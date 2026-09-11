"use client";

import { useEffect, useState } from "react";
import { Gauge, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { ActionPlan } from "@/components/documents/ActionPlan";
import { ATSAuditCard } from "@/components/documents/ATSAuditCard";
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

// Tone tracks the score itself, not a fixed agent-teal regardless of value
// (professional-polish pass, 2026-08-26, direct user report) — same tiering
// idea as EvaluationBreakdown.tsx's GRADE_STYLES: a strong score reads
// agent-teal (this is an AI judgement), a weak one reads warning, so the
// gauge's own color is honest about what it's showing, not just decorative.
function scoreTone(score: number): { stroke: string; chip: string } {
  if (score >= 7) return { stroke: "var(--color-agent)", chip: "bg-agent-light text-agent-dark" };
  if (score >= 4) return { stroke: "var(--color-text-muted)", chip: "bg-surface text-text-secondary" };
  return { stroke: "var(--color-warning)", chip: "bg-warning/15 text-warning" };
}

// Grows in from empty + counts up on mount, not full on first paint (same
// pattern as JobIdentityRail's match score / ResumeGapAnalysis's ScoreRing)
// — a real result just arrived, worth a real reveal instead of appearing
// instantly.
function ScoreGauge({ score }: { score: number }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const tone = scoreTone(score);
  const pct = Math.min(1, Math.max(0, score / 10));
  const r = 60;
  const circumference = Math.PI * r;
  const dash = circumference * (grown ? pct : 0);
  const displayScore = grown ? score : 0;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
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
            stroke={tone.stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: "stroke-dasharray 900ms var(--ease-out)" }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          <p className="font-mono text-2xl font-bold tabular-nums text-text-primary">{displayScore.toFixed(1)}</p>
        </div>
      </div>
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone.chip}`}>
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
  // Deterministic, zero-cost fixes the Action Plan applies directly — same
  // debounced save+rescore path the editor already uses, so a free fix
  // lands exactly like a manual edit.
  onCommitSections: (sections: ResumeSection[]) => void;
  onCommitStyle: (style: ResumeStyle) => void;
  style: ResumeStyle;
  sections: ResumeSection[];
  contact: { email: string | null; phone: string | null; location: string | null };
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
  onCommitSections,
  onCommitStyle,
  style,
  sections,
  contact,
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
        // Real depth, not a flat bg-surface-secondary fill (2026-08-26,
        // direct user report) — an agent-tinted border matches this app's
        // "AI-derived result" convention (the gauge's own color already
        // signals it's a judgement, not raw data).
        <div className="dim-card-in flex items-center gap-4 rounded-xl border border-agent/20 bg-surface p-4 shadow-card">
          <ScoreGauge score={scoreJump.score} />
          <div className="flex-1">
            {/* "Jumped from 5.0 to 5.0" was a real user-reported bug: the
                copy claimed an improvement whenever a previous score
                existed, without checking that the number moved — or which
                way it moved. A re-check that changes nothing is the common
                case, and celebrating it reads as broken. Compared on the
                rounded values actually shown, so the text can never
                contradict the two numbers beside it. */}
            {(() => {
              if (scoreJump.previousScore == null) {
                return <p className="text-sm font-medium text-text-primary">Fit score for this job</p>;
              }
              const before = Number(scoreJump.previousScore.toFixed(1));
              const after = Number(scoreJump.score.toFixed(1));
              if (after === before) {
                return (
                  <p className="text-sm font-medium text-text-primary">
                    Fit score unchanged at {after.toFixed(1)}
                  </p>
                );
              }
              const improved = after > before;
              return (
                <p className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                  {improved && <Sparkles className="h-4 w-4 shrink-0 text-agent" />}
                  Score {improved ? "rose" : "fell"} from {before.toFixed(1)} to {after.toFixed(1)}
                </p>
              );
            })()}
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
              className="btn-signal inline-flex min-h-9 items-center gap-2 rounded-lg px-4 text-xs font-medium text-accent-foreground"
            >
              <Gauge className="h-3.5 w-3.5" />
              Check my fit score
            </button>
          )}
          {analyzing && <Loader2 className="h-4 w-4 animate-spin text-text-muted" />}
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      )}

      <ATSAuditCard
        style={style}
        sections={sections}
        contact={contact}
        matchedKeywords={scoreJump?.matchedKeywords ?? []}
        missingKeywords={scoreJump?.missingKeywords ?? []}
      />

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
        style={style}
        sections={sections}
        contact={contact}
        onFocusBullet={onFocusBullet}
        onRevised={onRevised}
        onCommitSections={onCommitSections}
        onCommitStyle={onCommitStyle}
      />

      <div>
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">Quick tweaks</p>
        <RefinementChips jobId={jobId} onRevised={onRevised} />
      </div>

      <DocumentChatEditor jobId={jobId} kind="resume" onRevised={onRevised} />
    </div>
  );
}
