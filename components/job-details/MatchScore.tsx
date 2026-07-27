import { AlertTriangle } from "lucide-react";

import type { JobEvaluationDimension } from "@/types";

type Props = {
    matchReason: string | null;
    evaluation?: JobEvaluationDimension[] | null;
    recommendationScore?: number | null;
};

// Below this, Phase 9's spec calls it out visually — never hidden, never
// auto-actioned, just flagged so the candidate can still choose to apply.
const RECOMMENDATION_THRESHOLD = 4.0;

// 10-dimension grid moved to EvaluationBreakdown.tsx, and the skills
// comparison moved to Qualification.tsx (now correctable, alongside
// Required/Preferred) — see app/find-jobs/[id]/page.tsx.
export function MatchScore({
    matchReason,
    evaluation,
    recommendationScore,
}: Props) {
    const safeEvaluation = evaluation ?? [];

    const legitimacyDimension = safeEvaluation.find((d) => d.dimension === "Legitimacy");
    const legitimacyFlag =
        legitimacyDimension && (legitimacyDimension.grade === "D" || legitimacyDimension.grade === "F");
    const belowThreshold =
        recommendationScore != null && recommendationScore < RECOMMENDATION_THRESHOLD;

    return (
        <>
            <section className="glass-panel rounded-2xl p-6">
                <div className="mb-4 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-agent" />
                    <h2 className="font-mono text-[11px] font-semibold tracking-wide text-agent uppercase">
                        Agent read
                    </h2>
                </div>
                <div className="rounded-r-lg border-l-2 border-agent bg-agent-light px-4 py-3">
                    <p className="text-sm font-medium leading-6 text-agent-dark">
                        {matchReason ?? "No match reasoning is available for this role yet."}
                    </p>
                </div>

                {(legitimacyFlag || belowThreshold) && (
                    <div className="mt-4 flex flex-col gap-2">
                        {legitimacyFlag && (
                            <div className="flex items-start gap-2 rounded-lg bg-error/10 px-4 py-3">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
                                <p className="text-sm font-medium leading-6 text-error">
                                    Possible ghost listing — this posting graded poorly on legitimacy signals
                                    (vague compensation, generic requirements, or similar red flags).
                                </p>
                            </div>
                        )}
                        {belowThreshold && (
                            <div className="flex items-start gap-2 rounded-lg bg-error/10 px-4 py-3">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
                                <p className="text-sm font-medium leading-6 text-error">
                                    Below recommended threshold ({recommendationScore!.toFixed(1)}/5) — still
                                    worth a look if the role interests you, just not a strong overall fit.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </>
    );
}
