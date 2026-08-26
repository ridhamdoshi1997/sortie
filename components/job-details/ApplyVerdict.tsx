import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ApplyVerdict } from "@/lib/applyVerdict";

// Reuses the app's already-established Match Score Colors tiering
// (ui-tokens.md) rather than inventing a new palette: strong -> agent
// (teal, since this is synthesized from AI-generated evaluation data),
// middling -> neutral, weak -> warning/error depending on severity.
//
// Professional-polish pass (2026-08-25, direct user report: "these red and
// green whole straps also look cheap") — this used to be a full-bleed
// bg-{tone}/10 wash with even the body copy tinted the alert color. Now a
// neutral bg-surface card with a subtle tone-colored border and the color
// confined to a small icon chip + the label line; body copy stays ordinary
// text-secondary. Same recipe as MatchScore.tsx's FlagRow and
// FollowUpNudge.tsx.
const TIER_STYLES: Record<ApplyVerdict["tier"], { border: string; chip: string; label: string; icon: LucideIcon }> = {
  apply: { border: "border-agent/25", chip: "bg-agent-light text-agent-dark", label: "text-agent-dark", icon: CheckCircle2 },
  consider: { border: "border-border", chip: "bg-surface-secondary text-text-secondary", label: "text-text-secondary", icon: HelpCircle },
  "long-shot": { border: "border-warning/25", chip: "bg-warning/15 text-warning", label: "text-warning", icon: AlertTriangle },
  skip: { border: "border-error/25", chip: "bg-error/15 text-error", label: "text-error", icon: XCircle },
  unscored: { border: "border-border", chip: "bg-surface-secondary text-text-muted", label: "text-text-muted", icon: HelpCircle },
};

// Deterministic (lib/applyVerdict.ts, zero AI cost) — a single decisive
// answer to "should I apply to this?" at the very top of the page, before
// the user has to mentally combine a grade + a score + scattered warning
// callouts (MatchScore.tsx) themselves. build-plan.md's "Should I apply?
// quick verdict" (Tier 2).
export function ApplyVerdictBadge({ verdict }: { verdict: ApplyVerdict }) {
  const style = TIER_STYLES[verdict.tier];
  const Icon = style.icon;

  return (
    <div className={`flex items-start gap-3 rounded-xl border ${style.border} bg-surface px-4 py-3`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style.chip}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={`font-mono text-[11px] font-semibold uppercase tracking-wide ${style.label}`}>
          Should I apply? — {verdict.label}
        </p>
        <p className="mt-0.5 text-sm leading-5 text-text-secondary">{verdict.reason}</p>
      </div>
    </div>
  );
}
