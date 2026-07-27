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

// A 5-step traffic-light gradient across the app's existing semantic colors
// (success/info/warning/error) instead of collapsing A/B and C/D/F into
// just two buckets — every grade gets its own distinct, scannable color.
const GRADE_STYLES: Record<Grade, { label: string; badge: string }> = {
    A: { label: "Excellent", badge: "bg-success-lightest text-success-foreground" },
    B: { label: "Good", badge: "bg-info-lightest text-info-foreground" },
    C: { label: "Fair", badge: "bg-warning/10 text-warning" },
    D: { label: "Weak", badge: "bg-error/10 text-error" },
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
                    <p className="text-sm font-medium leading-5 text-text-primary">{dim.dimension}</p>
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
        <section className="glass-panel rounded-2xl p-6">
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
