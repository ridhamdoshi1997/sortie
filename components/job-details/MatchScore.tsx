import { Check, X } from "lucide-react";

type Props = {
    matchReason: string | null;
    matchedSkills: string[] | null; // Updated to allow null
    missingSkills: string[] | null; // Updated to allow null
};

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

export function MatchScore({ matchReason, matchedSkills, missingSkills }: Props) {
    // 1. Create safe arrays. If the DB returns null, treat it as an empty list []
    const safeMatchedSkills = matchedSkills || [];
    const safeMissingSkills = missingSkills || [];

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