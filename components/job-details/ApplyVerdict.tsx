import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ApplyVerdict } from "@/lib/applyVerdict";

// Reuses the app's already-established Match Score Colors tiering
// (ui-tokens.md) rather than inventing a new palette: strong -> agent
// (teal, since this is synthesized from AI-generated evaluation data),
// middling -> neutral, weak -> warning/error depending on severity.
const TIER_STYLES: Record<ApplyVerdict["tier"], { badge: string; icon: LucideIcon }> = {
  apply: { badge: "bg-agent-light text-agent-dark", icon: CheckCircle2 },
  consider: { badge: "bg-surface-secondary text-text-primary", icon: HelpCircle },
  "long-shot": { badge: "bg-warning/10 text-warning", icon: AlertTriangle },
  skip: { badge: "bg-error/10 text-error", icon: XCircle },
  unscored: { badge: "bg-surface-secondary text-text-muted", icon: HelpCircle },
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
    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 ${style.badge}`}>
      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wide">
          Should I apply? — {verdict.label}
        </p>
        <p className="mt-0.5 text-sm leading-5">{verdict.reason}</p>
      </div>
    </div>
  );
}
