import {
    Building2,
    Code2,
    DollarSign,
    Gauge,
    Globe,
    Heart,
    MapPin,
    Rocket,
    ShieldCheck,
    TrendingUp,
    type LucideIcon,
} from "lucide-react";

import type { DimensionName } from "@/lib/evaluator";
import type { JobEvaluationDimension } from "@/types";

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
const GRADE_STYLES: Record<Grade, { label: string; badge: string }> = {
    A: { label: "Excellent", badge: "bg-agent text-agent-foreground" },
    B: { label: "Good", badge: "bg-agent-light text-agent-dark" },
    C: { label: "Fair", badge: "bg-surface-secondary text-text-secondary" },
    D: { label: "Weak", badge: "bg-warning/10 text-warning" },
    F: { label: "Poor", badge: "bg-error text-error-foreground" },
};

// Fixed order/names per Phase 9 spec (lib/evaluator.ts's EVALUATION_DIMENSIONS)
// — typed against DimensionName so a renamed dimension fails to compile here
// instead of silently falling back to a generic icon.
const DIMENSION_ICONS: Record<DimensionName, LucideIcon> = {
    "Skills/tech match": Code2,
    "Seniority/level fit": TrendingUp,
    "Compensation fit": DollarSign,
    "Location/remote fit": MapPin,
    "Domain/industry fit": Building2,
    "Growth trajectory": Rocket,
    "Culture/values signal": Heart,
    "Visa/work-authorization fit": Globe,
    "Application effort-to-value": Gauge,
    Legitimacy: ShieldCheck,
};

// Contextual tooltips (build-plan.md §H) — what each dimension GENERALLY
// measures, distinct from `dim.note`'s per-job-specific reasoning already
// shown below it. A first-time user has no way to know what "Application
// effort-to-value" or "Legitimacy" even mean as categories without this.
// Plain native `title` attribute — no new tooltip component/dependency,
// keyboard/mouse accessible by default.
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

function DimensionCard({ dim }: { dim: JobEvaluationDimension }) {
    const style = GRADE_STYLES[dim.grade];
    const Icon = DIMENSION_ICONS[dim.dimension as DimensionName] ?? Gauge;

    return (
        <div className="flex gap-3 rounded-xl border border-border bg-surface-secondary p-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.badge}`}>
                <Icon className="h-4.5 w-4.5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <p
                        className="text-sm font-medium leading-5 text-text-primary underline decoration-dotted decoration-text-muted/50 underline-offset-2"
                        title={DIMENSION_EXPLANATIONS[dim.dimension as DimensionName]}
                    >
                        {dim.dimension}
                    </p>
                    <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${style.badge}`}
                    >
                        {dim.grade} · {style.label}
                    </span>
                </div>
                <p className="text-xs leading-5 text-text-muted">{dim.note}</p>
            </div>
        </div>
    );
}

// Rendered outside the job details page's narrow reading-width column
// (see app/find-jobs/[id]/page.tsx) — a 10-item grid needs real width to
// read as a grid rather than another stacked list.
export function EvaluationBreakdown({ evaluation, recommendationScore, overallGrade }: Props) {
    if (evaluation.length === 0) return null;

    const overallStyle = overallGrade ? GRADE_STYLES[overallGrade] : null;

    return (
        <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
                    10-Dimension Evaluation
                </h2>
                {overallGrade && overallStyle && (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-secondary px-4 py-2">
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

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {evaluation.map((dim) => (
                    <DimensionCard key={dim.dimension} dim={dim} />
                ))}
            </div>
        </section>
    );
}
