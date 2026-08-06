"use client";

import { Sparkles, Target } from "lucide-react";

import { useDocumentChat } from "@/components/documents/useDocumentChat";
import type { ScoreJumpResult } from "@/lib/scoreJump";
import type { ResumeAnalysis } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type RevisedData = { reply?: string; sections?: ResumeSection[]; style?: ResumeStyle; scoreJump?: ScoreJumpResult | null };

type Impact = "high" | "medium" | "quick_win";

type PlanItem =
  | { kind: "bullet"; impact: Impact; label: string; company: string; bulletText: string }
  | { kind: "prompt"; impact: Impact; label: string; prompt: string };

const IMPACT_LABEL: Record<Impact, string> = {
  high: "High impact",
  medium: "Medium impact",
  quick_win: "Quick win",
};

const IMPACT_STYLE: Record<Impact, string> = {
  high: "bg-error/10 text-error",
  medium: "bg-warning/10 text-warning",
  quick_win: "bg-agent-light text-agent-dark",
};

const RANK: Record<Impact, number> = { high: 0, medium: 1, quick_win: 2 };

// Real signals only, ranked — not a fabricated predicted-score-per-item
// (that would need either a second AI call per item or an invented number;
// this app has avoided fabricated numbers all session, see AIRewriteTab's
// own comment on why there's no "see what's changed" list). Impact tier
// comes from actual severity/category, not a guessed point value. Capped at
// 6 items — an unranked wall of 20+ issues is the exact "feedback fatigue"
// failure mode a ranked action plan is supposed to fix.
function buildPlan(scoreJump: ScoreJumpResult | null, qualityAnalysis: ResumeAnalysis | null): PlanItem[] {
  const items: PlanItem[] = [];

  for (const section of qualityAnalysis?.sections ?? []) {
    if (section.severity === "optional") continue;
    for (const issue of section.bulletIssues) {
      items.push({
        kind: "bullet",
        impact: section.severity === "urgent" ? "high" : "quick_win",
        label: `${issue.issueType}: "${issue.originalText.slice(0, 55)}${issue.originalText.length > 55 ? "…" : ""}"`,
        company: section.entryCompany ?? "",
        bulletText: issue.originalText,
      });
    }
  }

  for (const keyword of scoreJump?.missingKeywords ?? []) {
    items.push({
      kind: "prompt",
      impact: "high",
      label: `Work in the skill "${keyword}"`,
      prompt: `Naturally work the skill "${keyword}" into the most relevant bullet or the summary — only if it's genuinely something I have experience with, don't fabricate it.`,
    });
  }

  for (const dim of qualityAnalysis?.dimensions ?? []) {
    if (dim.grade !== "C" && dim.grade !== "D" && dim.grade !== "F") continue;
    items.push({
      kind: "prompt",
      impact: "medium",
      label: `Strengthen "${dim.dimension}" (currently ${dim.grade})`,
      prompt: `Improve the résumé's "${dim.dimension}" dimension — it's currently graded ${dim.grade} (${dim.note}). Focus specifically on strengthening this, without fabricating anything not already true.`,
    });
  }

  return items.sort((a, b) => RANK[a.impact] - RANK[b.impact]).slice(0, 6);
}

type Props = {
  jobId: string;
  scoreJump: ScoreJumpResult | null;
  qualityAnalysis: ResumeAnalysis | null;
  onFocusBullet: (company: string, bulletText: string) => void;
  onRevised: (data: RevisedData) => void;
};

export function ActionPlan({ jobId, scoreJump, qualityAnalysis, onFocusBullet, onRevised }: Props) {
  const { isPending, send } = useDocumentChat({ jobId, kind: "resume", onRevised });
  const items = buildPlan(scoreJump, qualityAnalysis);

  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">Action plan</p>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            disabled={item.kind === "prompt" && isPending}
            onClick={() => (item.kind === "bullet" ? onFocusBullet(item.company, item.bulletText) : send(item.prompt))}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary disabled:opacity-50"
          >
            <span className="flex items-center gap-2 truncate">
              {item.kind === "bullet" ? (
                <Target className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
              )}
              <span className="truncate">{item.label}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${IMPACT_STYLE[item.impact]}`}>
              {IMPACT_LABEL[item.impact]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
