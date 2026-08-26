"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    Building2,
    ChevronRight,
    Code2,
    DollarSign,
    Gauge,
    Globe,
    Heart,
    Layers,
    MapPin,
    Rocket,
    ShieldCheck,
    X,
    type LucideIcon,
} from "lucide-react";

import type { DimensionName } from "@/lib/evaluator";
import type { JobEvaluationDimension } from "@/types";

// Matches JobActionBar.tsx's StatusMenuPanel width class (w-72 there is
// 288px; this panel carries more text so it gets a bit more room) — kept
// as a real number so handleOpen below can clamp it inside the viewport
// before first paint, not after an overflow is already visible.
const PANEL_WIDTH = 320;

type Props = {
    evaluation: JobEvaluationDimension[];
    recommendationScore?: number | null;
    overallGrade?: "A" | "B" | "C" | "D" | "F" | null;
};

type Grade = "A" | "B" | "C" | "D" | "F";

// Redesigned 2026-07-28 — the previous version was a literal 5-color
// traffic-light gradient (green/blue/amber/red/dark-red), flagged by design
// review as reading like a generic B2B dashboard rather than a premium tool.
// Every grade here is AI-generated evaluation output, so per ui-tokens.md's
// invariant (`--color-accent` is reserved for user actions, never AI
// content), the "good" end of the scale uses `--color-agent` (teal, the
// app's existing AI-content signal) at varying intensity instead of amber —
// the same bg-agent-light/text-agent-dark pairing MatchScore.tsx's "Agent
// read" callout already uses. Only the two genuinely-concerning grades keep
// warning/error — a middling grade isn't an error, so it stays neutral gray
// rather than defaulting to a "yellow alert" the way a rainbow scale would.
// `bar` is a more saturated variant of the same tone, for the distribution
// strip below — the badge tones are tuned for text-on-tint legibility,
// too pale to read as a solid 6px strip on their own. `icon` is deliberately
// the subtlest of the three: a neutral chip with just the glyph tinted, so
// the per-row color read stays quiet and the badge alone carries the loud
// signal (a solid-filled icon chip repeated 10 times down the list is what
// actually read as "cheap" — one strong color accent per row beats two).
const GRADE_STYLES: Record<Grade, { label: string; badge: string; bar: string; icon: string }> = {
    A: { label: "Excellent", badge: "bg-agent text-agent-foreground", bar: "bg-agent", icon: "text-agent-dark" },
    B: { label: "Good", badge: "bg-agent-light text-agent-dark", bar: "bg-agent/55", icon: "text-agent-dark" },
    C: { label: "Fair", badge: "bg-surface-secondary text-text-secondary", bar: "bg-text-muted/35", icon: "text-text-secondary" },
    D: { label: "Weak", badge: "bg-warning/10 text-warning", bar: "bg-warning", icon: "text-warning" },
    F: { label: "Poor", badge: "bg-error text-error-foreground", bar: "bg-error", icon: "text-error" },
};

// Fixed order/names per Phase 9 spec (lib/evaluator.ts's EVALUATION_DIMENSIONS)
// — typed against DimensionName so a renamed dimension fails to compile here
// instead of silently falling back to a generic icon. Seniority/level fit
// moved from TrendingUp to Layers (professional-polish pass, 2026-08-25) —
// TrendingUp already reads as "growth," which Growth trajectory's own Rocket
// icon owns two rows down; Layers reads more precisely as a level/rung on a
// ladder, which is what this dimension actually measures.
const DIMENSION_ICONS: Record<DimensionName, LucideIcon> = {
    "Skills/tech match": Code2,
    "Seniority/level fit": Layers,
    "Compensation fit": DollarSign,
    "Location/remote fit": MapPin,
    "Domain/industry fit": Building2,
    "Growth trajectory": Rocket,
    "Culture/values signal": Heart,
    "Visa/work-authorization fit": Globe,
    "Application effort-to-value": Gauge,
    Legitimacy: ShieldCheck,
};

// What each dimension GENERALLY measures, distinct from a specific job's own
// `note`. Previously surfaced via a hover-only Tooltip on the dimension
// name — real information, but hidden behind a dotted underline that did
// nothing on touch. Now lives in DimensionDetailModal below, opened by
// tapping/clicking the row itself, which works identically with mouse,
// keyboard, and touch.
const DIMENSION_EXPLANATIONS: Record<DimensionName, string> = {
    "Skills/tech match": "How well your listed skills align with what this job actually requires.",
    "Seniority/level fit": "Whether this role's real seniority matches your experience level — not just the job title.",
    "Compensation fit": "How the posted or inferred pay compares to your stated salary expectations.",
    "Location/remote fit": "Whether the role's location/remote policy matches your own preferences.",
    "Domain/industry fit": "How closely this company's industry matches your background or stated interests.",
    "Growth trajectory": "What this role signals about your career trajectory — a step up, sideways, or down.",
    "Culture/values signal": "What the job posting and company research suggest about working style and values fit.",
    "Visa/work-authorization fit": "Whether your work authorization status is likely compatible with this role, based on what's disclosed.",
    "Application effort-to-value": "Whether the likely effort to apply well is proportionate to the role's real upside.",
    Legitimacy: "Real-listing signals — vague requirements, generic descriptions, or other red flags of a low-quality posting.",
};

// Professional-polish pass (2026-08-25, direct user report: the previous
// 3-column grid of 10 identical bordered-box tiles "looks horrible", and a
// follow-up round after the first list pass: "still looks cheap, add
// colors animations", plus a direct request to make each row clickable
// for more depth). Real bordered tiles read as a checklist; a dense divided
// list read cleaner but static. This version is a real interactive list —
// hover feedback, a chevron affordance, and a click target — backed by a
// genuine detail modal, not decoration. index still drives a capped
// entrance stagger on first reveal, same convention JobResultCard.tsx uses.
function DimensionRow({
    dim,
    index = 0,
    onOpen,
}: {
    dim: JobEvaluationDimension;
    index?: number;
    onOpen: (dim: JobEvaluationDimension, trigger: HTMLElement) => void;
}) {
    const style = GRADE_STYLES[dim.grade];
    const Icon = DIMENSION_ICONS[dim.dimension as DimensionName] ?? Gauge;

    return (
        <button
            type="button"
            onClick={(event) => onOpen(dim, event.currentTarget)}
            className="dim-card-in group flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-surface-secondary/70"
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
            <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary transition-transform duration-200 group-hover:scale-105 ${style.icon}`}
            >
                <Icon className="h-4 w-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium leading-5 text-text-primary">{dim.dimension}</p>
                    <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold ${style.badge}`}
                    >
                        {dim.grade} · {style.label}
                    </span>
                </div>
                <p className="text-xs leading-5 text-text-muted">{dim.note}</p>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 -translate-x-1 text-text-muted opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
        </button>
    );
}

// Portaled to document.body, position:fixed computed from the clicked
// row's own getBoundingClientRect() — was a screen-centered modal at
// first, moved to this anchored-popover shape (2026-08-25, direct user
// report: "coming middle of the screen instead where I am clicking"). Same
// idiom as JobActionBar.tsx's StatusMenuPanel/NotePromptPanel: portal +
// fixed position + click-outside/Escape/scroll to close, since a plain
// absolutely-positioned child would paint under/over whichever row sits
// below it in this same list (confirmed pattern, not a guess — that's the
// exact bug StatusMenuPanel itself was built to fix).
function DimensionDetailPanel({
    dim,
    position,
    onClose,
}: {
    dim: JobEvaluationDimension;
    // `openUpward` anchors the panel's BOTTOM edge to `position.top` via a
    // translateY(-100%) instead of its top edge — the panel's real height
    // varies with content length, so this sidesteps needing to know it in
    // advance to flip a tall panel above a row near the bottom of the list.
    position: { top: number; left: number; openUpward?: boolean };
    onClose: () => void;
}) {
    const style = GRADE_STYLES[dim.grade];
    const Icon = DIMENSION_ICONS[dim.dimension as DimensionName] ?? Gauge;
    const explanation = DIMENSION_EXPLANATIONS[dim.dimension as DimensionName];
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function onClickOutside(event: MouseEvent) {
            if (!panelRef.current?.contains(event.target as Node)) onClose();
        }
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        document.addEventListener("mousedown", onClickOutside);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onClickOutside);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [onClose]);

    useEffect(() => {
        window.addEventListener("scroll", onClose, true);
        return () => window.removeEventListener("scroll", onClose, true);
    }, [onClose]);

    if (typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={panelRef}
            style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: PANEL_WIDTH,
                transform: position.openUpward ? "translateY(-100%)" : undefined,
            }}
            className="glass-panel-strong animate-in fade-in-0 zoom-in-95 z-50 rounded-2xl p-5 duration-150"
            role="dialog"
            aria-label={dim.dimension}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.badge}`}>
                        <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                        <p className="font-display text-[15px] font-semibold leading-tight text-text-primary">
                            {dim.dimension}
                        </p>
                        <span
                            className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${style.badge}`}
                        >
                            {dim.grade} · {style.label}
                        </span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {explanation && (
                <div className="mt-4 border-t border-border-light pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">What this measures</p>
                    <p className="mt-1.5 text-sm leading-6 text-text-secondary">{explanation}</p>
                </div>
            )}

            <div className="mt-3 border-t border-border-light pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">For this role</p>
                <p className="mt-1.5 text-sm leading-6 text-text-primary">{dim.note}</p>
            </div>
        </div>,
        document.body,
    );
}

export function EvaluationBreakdown({ evaluation, recommendationScore, overallGrade }: Props) {
    const [openDim, setOpenDim] = useState<{
        dim: JobEvaluationDimension;
        position: { top: number; left: number; openUpward?: boolean };
    } | null>(null);

    function handleOpen(dim: JobEvaluationDimension, trigger: HTMLElement): void {
        const rect = trigger.getBoundingClientRect();
        // Right-clamped so the panel never overflows off the right edge on
        // a narrow viewport; left-clamped with the same 16px margin so it
        // never touches the left edge either.
        const left = Math.min(Math.max(16, rect.left), window.innerWidth - PANEL_WIDTH - 16);
        // Flip above the row when there isn't much room below it (a real,
        // common case here — this list runs the full page height, so the
        // last few rows are often near the viewport's bottom edge) and
        // there's meaningfully more room above than below.
        const spaceBelow = window.innerHeight - rect.bottom;
        const openUpward = spaceBelow < 260 && rect.top > spaceBelow;
        setOpenDim({
            dim,
            position: { top: openUpward ? rect.top - 8 : rect.bottom + 8, left, openUpward },
        });
    }

    if (evaluation.length === 0) return null;

    const overallStyle = overallGrade ? GRADE_STYLES[overallGrade] : null;

    return (
        <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
                    10-Dimension Evaluation
                </h2>
                {overallGrade && overallStyle && (
                    // Signal redesign — every grade here is AI-generated
                    // output (see GRADE_STYLES's own comment), so the
                    // overall-grade summary gets a real agent-teal tint
                    // instead of the neutral surface-secondary box it used
                    // to sit in, matching the same invariant the per-grade
                    // badge colors already follow.
                    <div className="flex items-center gap-3 rounded-xl border border-agent/25 bg-agent-light/50 px-4 py-2">
                        <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-lg font-bold ${overallStyle.badge}`}
                        >
                            {overallGrade}
                        </span>
                        <div className="flex flex-col leading-tight">
                            <span className="text-sm font-semibold text-text-primary">
                                Overall: {overallStyle.label}
                            </span>
                            {recommendationScore != null && (
                                <span className="text-xs text-text-muted">
                                    {recommendationScore.toFixed(1)} / 5 recommendation
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Grade-distribution strip — a real at-a-glance read on the full
                spread of 10 grades before the reader works through the list
                one row at a time, and the one place this card gets to be
                genuinely colorful without turning any single row into a
                solid color block. Each segment is a real dimension's real
                grade, not a decorative gradient. */}
            <div className="mt-4 flex h-1.5 gap-[3px] overflow-hidden rounded-full">
                {evaluation.map((dim, i) => (
                    <span
                        key={dim.dimension}
                        className={`dim-bar-in h-full flex-1 rounded-full ${GRADE_STYLES[dim.grade].bar}`}
                        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    />
                ))}
            </div>

            {/* No divider lines between rows — each row now carries its own
                rounded hover highlight, which reads better inset from the
                card edge than a full-bleed divider clashing against it. */}
            <div className="mt-3 flex flex-col gap-0.5">
                {evaluation.map((dim, i) => (
                    <DimensionRow key={dim.dimension} dim={dim} index={i} onOpen={handleOpen} />
                ))}
            </div>

            {openDim && (
                <DimensionDetailPanel dim={openDim.dim} position={openDim.position} onClose={() => setOpenDim(null)} />
            )}
        </section>
    );
}
