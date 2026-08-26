"use client";

import { Sparkles } from "lucide-react";

// Signal-direction loaders, ported from the Signal mockup's "Progress &
// thinking loaders" block.
//
// NOT WIRED INTO ANY REAL FLOW YET — deliberately. Phase 21 built a loader
// that matched its mockup exactly and it was still rejected outright once
// seen in situ, so these live on /preview/loaders for a design decision
// first. Do not import them into a real AI flow until that's settled.
//
// Two genuinely different components, because they answer different
// questions and must not be swapped for each other:
//   SignalProgressBar — DETERMINATE. Only for work with a real measured
//     fraction (n of m items processed). Never feed it a fake ticking
//     number; this app's honesty rule applies to progress exactly as much
//     as to AI copy.
//   AiThinkingCard    — INDETERMINATE. For a single opaque AI call where
//     no honest percentage exists.

export function SignalProgressBar({
  label,
  value,
  total,
}: {
  label: string;
  /** Real completed count — not a synthetic timer. */
  value: number;
  total: number;
}) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  const pct = Math.round(ratio * 100);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-text-secondary">{label}</span>
        <b className="font-mono text-xs font-bold tabular-nums text-agent-dark">{pct}%</b>
      </div>
      <div
        className="signal-meter-track w-full"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {/* No .signal-fill-in here on purpose — this bar's value changes at
            runtime, so it wants the plain transition. The load-fill
            animation is for bars whose value is fixed at render. */}
        <div className="signal-meter-fill" style={{ "--fill": ratio } as React.CSSProperties} />
      </div>
      <p className="mt-2 font-mono text-[11px] text-text-muted">
        {value} of {total}
      </p>
    </div>
  );
}

export function AiThinkingCard({ status, className }: { status: string; className?: string }) {
  return (
    // .ai-mini-card is already exactly the mockup's .thinking panel
    // (agent-teal tint + teal hairline border) — reused rather than
    // duplicated as a third near-identical teal card.
    <div
      className={`ai-mini-card flex flex-col gap-3 px-4 py-4 ${className ?? ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-xs font-bold text-agent-dark">
        <Sparkles className="signal-think-icon h-3.5 w-3.5" />
        AI Navigator is thinking
      </div>
      <div className="signal-sweep-track">
        <div className="signal-sweep-fill" />
      </div>
      <p className="text-[11.5px] font-medium text-text-secondary">{status}</p>
    </div>
  );
}
