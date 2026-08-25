"use client";

import {
    AlertTriangle,
    ArrowRight,
    Check,
    FileSearch,
    Minus,
    X,
} from "lucide-react";

import type {
    GapCheckResult,
    GapStatus,
    ResumeGapAnalysisResult,
} from "@/types";

// Re-exported under the preview page's existing names so this component's
// shape stays the single source of truth in @/types without touching every
// call site.
export type { GapStatus };
export type GapCheck = GapCheckResult;
export type ResumeGapAnalysisData = ResumeGapAnalysisResult;

type Props = {
    data: ResumeGapAnalysisData;
    /** e.g. "3 fit checks left today" — surfaced at point of use, not buried. */
    usageLabel?: string;
    isGenerating?: boolean;
    onImprove?: () => void;
    /** Model/resume-theme controls, rendered by the caller — this component
     * doesn't know about ModelSelector/ThemeSelector's own prop shapes, it
     * just has a slot for them in its header. */
    settingsRow?: React.ReactNode;
};

// Sortie's own scoring language. Deliberately not quoting an industry
// "ATS threshold" statistic — this is our assessment of fit against this
// posting, and the copy says so rather than implying an external standard.
//
// Redesigned 2026-07-28 — top two tiers were a literal green/blue traffic
// light. This score is AI-generated, so "Strong fit" uses --color-agent
// (the app's AI-content signal, not a generic success green) and "Decent
// fit" is neutral gray rather than an "info" blue — a decent-but-unremarkable
// fit isn't a notable event worth its own color. The bottom two tiers keep
// warning/error: their copy already carries real cautionary guidance
// ("reconsider the role"), so that severity stays intentional, not decorative.
function scoreBand(score: number): {
    label: string;
    ring: string;
    text: string;
    chip: string;
    guidance: string;
} {
    if (score >= 8) {
        return {
            label: "Strong fit",
            ring: "text-agent",
            text: "text-agent-dark",
            chip: "bg-agent-light text-agent-dark",
            guidance: "This resume already lines up well with the posting. Tailoring will be light-touch.",
        };
    }
    if (score >= 6) {
        return {
            label: "Decent fit",
            ring: "text-text-secondary",
            text: "text-text-primary",
            chip: "bg-surface-secondary text-text-secondary",
            guidance: "A solid base with real gaps worth closing before you apply.",
        };
    }
    if (score >= 4) {
        return {
            label: "Needs work",
            ring: "text-warning",
            text: "text-warning",
            chip: "bg-warning/10 text-warning",
            guidance: "Several requirements aren't reflected in your resume yet. Worth tailoring before applying.",
        };
    }
    return {
        label: "Weak fit",
        ring: "text-error",
        text: "text-error",
        chip: "bg-error/10 text-error",
        guidance: "This resume doesn't currently speak to what the posting asks for. Tailor it, or reconsider the role.",
    };
}

function ScoreRing({ score }: { score: number }) {
    const band = scoreBand(score);
    const radius = 44;
    const circumference = 2 * Math.PI * radius;
    const pct = Math.max(0, Math.min(10, score)) / 10;
    const offset = circumference * (1 - pct);

    return (
        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
            <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100" aria-hidden>
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    strokeWidth="7"
                    className="stroke-border"
                />
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className={`${band.ring} transition-[stroke-dashoffset] duration-700 ease-out`}
                    stroke="currentColor"
                />
            </svg>
            <div className="absolute flex flex-col items-center leading-none">
                <span className="font-mono text-2xl font-bold tabular-nums text-text-primary">
                    {score.toFixed(1)}
                </span>
                <span className="mt-0.5 font-mono text-[10px] tracking-wide text-text-muted">
                    / 10
                </span>
            </div>
        </div>
    );
}

function StatusIcon({ status }: { status: GapStatus }) {
    if (status === "pass") {
        return (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-lightest text-success-foreground">
                <Check className="h-3 w-3" />
            </span>
        );
    }
    if (status === "warn") {
        return (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
                <Minus className="h-3 w-3" />
            </span>
        );
    }
    return (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-error/10 text-error">
            <X className="h-3 w-3" />
        </span>
    );
}

export function ResumeGapAnalysis({ data, usageLabel, isGenerating, onImprove, settingsRow }: Props) {
    const band = scoreBand(data.score);
    const totalKeywords = data.matchedKeywords.length + data.missingKeywords.length;

    return (
        <section className="border border-border bg-surface shadow-card overflow-hidden rounded-2xl">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted text-accent">
                        <FileSearch className="h-4 w-4" />
                    </div>
                    <h2 className="text-base font-semibold leading-6 text-text-primary">
                        Resume fit for this job
                    </h2>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    {usageLabel && (
                        <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] tracking-wide text-text-muted">
                            {usageLabel}
                        </span>
                    )}
                    {settingsRow}
                </div>
            </div>

            {/* Score + guidance */}
            <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
                <ScoreRing score={data.score} />
                <div className="flex flex-col gap-2">
                    <span
                        className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${band.chip}`}
                    >
                        {band.label}
                    </span>
                    <p className="text-sm leading-6 text-text-secondary">{band.guidance}</p>
                    <p className="text-xs leading-5 text-text-muted">
                        Scored against this posting only — a different job will score differently.
                    </p>
                </div>
            </div>

            {/* Per-check gaps */}
            <div className="border-t border-border">
                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-6 py-3 sm:grid">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        Requirement
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        What the job asks
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        What your resume says
                    </span>
                </div>
                <div className="flex flex-col divide-y divide-border border-t border-border">
                    {data.checks.map((check) => (
                        <div
                            key={check.label}
                            className="grid grid-cols-1 gap-2 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-4"
                        >
                            <div className="flex items-center gap-2">
                                <StatusIcon status={check.status} />
                                <span className="text-sm font-medium leading-5 text-text-primary">
                                    {check.label}
                                </span>
                            </div>
                            <p className="text-sm leading-5 text-text-secondary sm:pl-0 pl-7">
                                {check.jobSide}
                            </p>
                            <p
                                className={`pl-7 text-sm leading-5 sm:pl-0 ${
                                    check.status === "pass" ? "text-text-secondary" : band.text
                                }`}
                            >
                                {check.resumeSide}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Keywords */}
            <div className="border-t border-border p-6">
                <div className="mb-3 flex items-baseline gap-2">
                    <h3 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
                        Keyword coverage
                    </h3>
                    <span className="font-mono text-xs tabular-nums text-text-muted">
                        {data.matchedKeywords.length}/{totalKeywords}
                    </span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {data.matchedKeywords.map((keyword) => (
                        <span
                            key={keyword}
                            className="inline-flex items-center gap-1 rounded-full bg-success-lightest px-3 py-1 text-xs font-medium text-success-foreground"
                        >
                            <Check className="h-3 w-3" />
                            {keyword}
                        </span>
                    ))}
                    {data.missingKeywords.map((keyword) => (
                        <span
                            key={keyword}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-text-muted"
                        >
                            <X className="h-3 w-3" />
                            {keyword}
                        </span>
                    ))}
                </div>
                {data.missingKeywords.length > 0 && (
                    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-text-muted">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                        Only terms your real experience actually supports will be added — Sortie
                        won&apos;t claim a skill you don&apos;t have.
                    </p>
                )}
            </div>

            {/* CTA — only when a caller actually wires onImprove. The
                job-details page doesn't: DocumentGenerator right below this
                panel already owns the real "generate tailored resume" flow,
                so rendering this unconditionally was a second, non-functional
                button duplicating it. */}
            {onImprove && (
                <div className="border-t border-border bg-surface-secondary p-6">
                    <button
                        type="button"
                        disabled={isGenerating}
                        onClick={onImprove}
                        className="btn-signal inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-60"
                    >
                        {isGenerating ? "Tailoring your resume..." : "Improve my resume for this job"}
                        {!isGenerating && <ArrowRight className="h-4 w-4" />}
                    </button>
                </div>
            )}
        </section>
    );
}
