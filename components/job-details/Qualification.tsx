"use client";

import { useState, useTransition } from "react";
import { Award, Check, CheckCircle2, Circle, X } from "lucide-react";

import { correctSkillTag } from "@/actions/jobs";
import { JobDescriptionDecoder } from "@/components/job-details/JobDescriptionDecoder";
import type { Job } from "@/types";

type Props = {
  jobId: string;
  matchedSkills: string[] | null;
  missingSkills: string[] | null;
  requirements: string[];
  niceToHave: string[];
  jdDecoder?: Job["jd_decoder"];
  // §Q2 — how many skill_corrections rows exist for this job's own role
  // family, and the role family label itself. Zero/undefined means either
  // no corrections have been made yet or this job's evaluation predates
  // §Q2 — either way, no line renders. Computed server-side (app/find-jobs/
  // [id]/page.tsx), not fetched client-side, since it's a one-time read
  // that doesn't need to react to anything on this page.
  correctionsAppliedCount?: number;
  roleFamily?: string;
};

// Required gets a solid accent-toned check (must-have, weighted heavier);
// Preferred gets a lighter outline dot (nice-to-have) — the two columns
// used to be visually identical bullet lists with nothing but the header
// label distinguishing "must-have" from "optional," which is the actual
// distinction that matters here.
function BulletColumn({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "required" | "preferred";
}) {
  if (items.length === 0) return null;
  const Icon = variant === "required" ? CheckCircle2 : Circle;

  return (
    <div>
      <h3 className="text-sm font-semibold leading-5 text-text-primary">{title}</h3>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-text-primary">
            <Icon
              className={`mt-1 h-3.5 w-3.5 shrink-0 ${
                variant === "required" ? "text-accent" : "text-text-muted"
              }`}
            />
            <span className={variant === "preferred" ? "text-text-secondary" : "font-medium"}>
              {item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Qualification({
  jobId,
  matchedSkills,
  missingSkills,
  requirements,
  niceToHave,
  jdDecoder,
  correctionsAppliedCount = 0,
  roleFamily,
}: Props) {
  const [matched, setMatched] = useState(matchedSkills ?? []);
  const [missing, setMissing] = useState(missingSkills ?? []);
  const [isPending, startTransition] = useTransition();

  function handleCorrect(skill: string, moveTo: "matched" | "missing"): void {
    const prevMatched = matched;
    const prevMissing = missing;

    if (moveTo === "matched") {
      setMatched((current) => (current.includes(skill) ? current : [...current, skill]));
      setMissing((current) => current.filter((item) => item !== skill));
    } else {
      setMissing((current) => (current.includes(skill) ? current : [...current, skill]));
      setMatched((current) => current.filter((item) => item !== skill));
    }

    startTransition(async () => {
      const result = await correctSkillTag(jobId, skill, moveTo);
      if (!result.success) {
        setMatched(prevMatched);
        setMissing(prevMissing);
      }
    });
  }

  const hasSkills = matched.length > 0 || missing.length > 0;

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="mb-1 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
            <Award className="h-4 w-4 text-text-secondary" />
          </div>
          <h2 className="text-base font-semibold leading-6 text-text-primary">Qualification</h2>
        </div>
        <p className="mt-1 flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
          <Check className="h-3 w-3 text-success" />
          Represents the skills you have
        </p>
      </div>

      <p className="mb-4 mt-3 text-sm leading-6 text-text-secondary">
        Find out how your skills align with this job&apos;s requirements. If anything seems off,
        you can easily click on the tags to select or unselect skills to reflect your actual
        expertise.
      </p>

      {correctionsAppliedCount > 0 && roleFamily && (
        <p className="mb-4 text-xs text-text-muted">
          Sortie remembered {correctionsAppliedCount} thing{correctionsAppliedCount === 1 ? "" : "s"} you
          told it about your {roleFamily} skills.
        </p>
      )}

      {hasSkills ? (
        <div className="flex flex-wrap gap-2">
          {matched.map((skill) => (
            <button
              key={skill}
              type="button"
              disabled={isPending}
              onClick={() => handleCorrect(skill, "missing")}
              title="Move to gap skills"
              className="inline-flex items-center gap-1 rounded-full bg-success-lightest px-3 py-1 text-xs font-medium text-success-foreground transition-opacity hover:opacity-80 disabled:opacity-60"
            >
              <Check className="h-3 w-3" />
              {skill}
            </button>
          ))}
          {missing.map((skill) => (
            <button
              key={skill}
              type="button"
              disabled={isPending}
              onClick={() => handleCorrect(skill, "matched")}
              title="Move to your skills"
              className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent transition-opacity hover:opacity-80 disabled:opacity-60"
            >
              <X className="h-3 w-3" />
              {skill}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-muted">No skills were recorded for this job.</p>
      )}

      {(requirements.length > 0 || niceToHave.length > 0) && (
        <div className="mt-6 grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
          <BulletColumn title="Required" items={requirements} variant="required" />
          <BulletColumn title="Preferred" items={niceToHave} variant="preferred" />
        </div>
      )}

      {requirements.length > 0 && <JobDescriptionDecoder jobId={jobId} decoded={jdDecoder ?? null} />}
    </section>
  );
}
