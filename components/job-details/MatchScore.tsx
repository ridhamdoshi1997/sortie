import { AlertTriangle, Check, X } from "lucide-react";

import type { JobEvaluationDimension } from "@/types";

type Props = {
    matchReason: string | null;
    matchedSkills: string[] | null; // Updated to allow null
    missingSkills: string[] | null; // Updated to allow null
    evaluation?: JobEvaluationDimension[] | null;
    recommendationScore?: number | null;
};

// Below this, Phase 9's spec calls it out visually — never hidden, never
// auto-actioned, just flagged so the candidate can still choose to apply.
const RECOMMENDATION_THRESHOLD = 4.0;

function SkillBadge({
    skill,
    type,
}: {
    skill: string;
    type: "matched" | "missing";
}) {
    const isMatched = type === "matched";
    const Icon = isMatched ? Check : X;
    const className = isMatched
        ? "bg-success-lightest text-success-foreground"
        : "bg-accent-muted text-accent";

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${className}`}
        >
            <Icon className="h-3 w-3" />
            {skill}
        </span>
    );
}

// 10-dimension grid moved to EvaluationBreakdown.tsx, rendered as a sibling
// outside this page's narrow reading-width column — see
// app/find-jobs/[id]/page.tsx.
export function MatchScore({
    matchReason,
    matchedSkills,
    missingSkills,
    evaluation,
    recommendationScore,
}: Props) {
    // 1. Create safe arrays. If the DB returns null, treat it as an empty list []
    const safeMatchedSkills = matchedSkills || [];
    const safeMissingSkills = missingSkills || [];
    const safeEvaluation = evaluation ?? [];

    const legitimacyDimension = safeEvaluation.find((d) => d.dimension === "Legitimacy");
    const legitimacyFlag =
        legitimacyDimension && (legitimacyDimension.grade === "D" || legitimacyDimension.grade === "F");
    const belowThreshold =
        recommendationScore != null && recommendationScore < RECOMMENDATION_THRESHOLD;

    return (
        <>
            <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
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

            <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
                <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
                    Required Skills vs Your Profile
                </h2>

                <div className="mt-5 flex flex-col gap-4">
                    <div>
                        <p className="mb-2 text-xs font-medium leading-4 text-text-muted">You have</p>
                        {/* 2. Use the safe variables here */}
                        {safeMatchedSkills.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {safeMatchedSkills.map((skill) => (
                                    <SkillBadge key={skill} skill={skill} type="matched" />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-text-muted">No matched skills were recorded.</p>
                        )}
                    </div>

                    <div>
                        <p className="mb-2 text-xs font-medium leading-4 text-text-muted">Gap skills</p>
                        {/* 2. Use the safe variables here */}
                        {safeMissingSkills.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {safeMissingSkills.map((skill) => (
                                    <SkillBadge key={skill} skill={skill} type="missing" />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-text-muted">No gap skills were recorded.</p>
                        )}
                    </div>
                </div>
            </section>
        </>
    );
}
