import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import type { JobEvaluationDimension } from "@/types";
import { AiReadsCard } from "@/components/shared/AiReadsCard";

type Props = {
    matchReason: string | null;
    evaluation?: JobEvaluationDimension[] | null;
    recommendationScore?: number | null;
    titleScopeMismatch?: { flagged: boolean; note: string } | null;
};

// Below this, Phase 9's spec calls it out visually — never hidden, never
// auto-actioned, just flagged so the candidate can still choose to apply.
const RECOMMENDATION_THRESHOLD = 4.0;

// Professional-polish pass (2026-08-25, direct user report: "these red and
// green whole straps also look cheap"): these used to be a full-bleed
// bg-warning/10 or bg-error/10 wash across the entire row, with even the
// body copy tinted the alert color — a flat "Bootstrap alert" look. Real
// premium references (Linear/Stripe inline warnings) keep the surface
// neutral and confine color to a small icon chip and the lead phrase;
// everything else reads as ordinary body text. Same recipe now shared with
// ApplyVerdictBadge and FollowUpNudge.
function FlagRow({ tone, icon: Icon, children }: { tone: "warning" | "error"; icon: typeof AlertTriangle; children: ReactNode }) {
    const border = tone === "warning" ? "border-warning/25" : "border-error/25";
    const chip = tone === "warning" ? "bg-warning/15 text-warning" : "bg-error/15 text-error";

    return (
        <div className={`flex items-start gap-3 rounded-xl border ${border} bg-surface px-4 py-3`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${chip}`}>
                <Icon className="h-4 w-4" />
            </span>
            <p className="pt-1 text-sm leading-6 text-text-secondary">{children}</p>
        </div>
    );
}

// 10-dimension grid moved to EvaluationBreakdown.tsx, and the skills
// comparison moved to Qualification.tsx (now correctable, alongside
// Required/Preferred) — see app/find-jobs/[id]/page.tsx.
export function MatchScore({
    matchReason,
    evaluation,
    recommendationScore,
    titleScopeMismatch,
}: Props) {
    const safeEvaluation = evaluation ?? [];

    const legitimacyDimension = safeEvaluation.find((d) => d.dimension === "Legitimacy");
    const legitimacyFlag =
        legitimacyDimension && (legitimacyDimension.grade === "D" || legitimacyDimension.grade === "F");
    const belowThreshold =
        recommendationScore != null && recommendationScore < RECOMMENDATION_THRESHOLD;
    const scopeMismatchFlag = titleScopeMismatch?.flagged ?? false;

    return (
        <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
            <AiReadsCard>
                <p className="text-sm leading-6 text-text-primary">
                    {matchReason ?? "No match reasoning is available for this role yet."}
                </p>
            </AiReadsCard>

            {(legitimacyFlag || belowThreshold || scopeMismatchFlag) && (
                <div className="mt-4 flex flex-col gap-2">
                    {scopeMismatchFlag && (
                        <FlagRow tone="warning" icon={AlertTriangle}>
                            <span className="font-semibold text-warning">Possible title/scope mismatch — </span>
                            {titleScopeMismatch!.note}
                        </FlagRow>
                    )}
                    {legitimacyFlag && (
                        <FlagRow tone="error" icon={AlertTriangle}>
                            <span className="font-semibold text-error">Possible ghost listing — </span>
                            this posting graded poorly on legitimacy signals (vague compensation, generic
                            requirements, or similar red flags).
                        </FlagRow>
                    )}
                    {belowThreshold && (
                        <FlagRow tone="error" icon={AlertTriangle}>
                            <span className="font-semibold text-error">
                                Below recommended threshold ({recommendationScore!.toFixed(1)}/5) —{" "}
                            </span>
                            still worth a look if the role interests you, just not a strong overall fit.
                        </FlagRow>
                    )}
                </div>
            )}
        </section>
    );
}
