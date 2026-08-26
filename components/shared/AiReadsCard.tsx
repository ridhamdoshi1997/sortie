import type { CSSProperties, ReactNode } from "react";

// Shared "AI Navigator reads" surface. Direct user request: every page's
// AI-output block should carry the same treatment the dashboard's
// WeeklyBriefingCard already had (.ai-hero-card + the pulsing
// .ai-eyebrow-dot), instead of the flat `border-l-2 border-agent
// bg-agent-light` callout that ~24 files each re-implemented by hand.
//
// This supersedes the earlier "the hero tier stays deliberately rare"
// note in ui-registry.md — that was a judgment call, and the user's own
// direction overrides it. One definition, many call sites, matching this
// file tree's existing .btn-signal / .card-interactive-glow convention,
// so the next change to this pattern is a one-file edit rather than
// another 24-file sweep.
//
// Agent-teal only, never accent — the app's Agent-content invariant is
// unchanged, this is purely a richer rendering of the same semantic.
export function AiReadsCard({
  label = "AI Navigator reads",
  variant = "hero",
  meta,
  className,
  style,
  children,
}: {
  label?: string;
  /**
   * "hero" — a page's own AI moment (the mockup's .ai-hero): gradient,
   * outer glow, pulsing dot. "compact" — AI output nested inside an
   * already-dense card (the mockup's .ai-mini): flat tint, static dot.
   * Two real tiers from the mockup, not one scaled up and down.
   */
  variant?: "hero" | "compact";
  /** Optional right-aligned slot on the eyebrow row — a timestamp, a source note. */
  meta?: ReactNode;
  className?: string;
  /** Passed through to the root div — mainly for an `animationDelay` when
   * this card is one of several staggering in together. */
  style?: CSSProperties;
  children: ReactNode;
}) {
  const isHero = variant === "hero";

  return (
    <div
      className={`${isHero ? "ai-hero-card px-5 py-4" : "ai-mini-card px-3.5 py-2.5"} ${className ?? ""}`}
      style={style}
    >
      <div className={`flex items-center justify-between gap-2 ${isHero ? "mb-2.5" : "mb-1.5"}`}>
        <p
          className={`flex items-center gap-2 font-mono font-semibold uppercase tracking-wide text-agent-dark ${
            isHero ? "text-[11px]" : "text-[10px]"
          }`}
        >
          <span className={isHero ? "ai-eyebrow-dot" : "ai-eyebrow-dot-static"} />
          {label}
        </p>
        {meta}
      </div>
      {children}
    </div>
  );
}
