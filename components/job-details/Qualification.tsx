"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";

import { correctSkillTag } from "@/actions/jobs";

type Props = {
  jobId: string;
  matchedSkills: string[] | null;
  missingSkills: string[] | null;
  requirements: string[];
  niceToHave: string[];
};

function BulletColumn({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold leading-5 text-text-primary">{title}</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm font-medium leading-6 text-text-primary">
        {items.map((item) => (
          <li key={item}>{item}</li>
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

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
        Qualification
      </h2>

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-medium leading-4 text-text-muted">
            You have — click a skill if this is wrong
          </p>
          {matched.length > 0 ? (
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
            </div>
          ) : (
            <p className="text-sm text-text-muted">No matched skills were recorded.</p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium leading-4 text-text-muted">
            Gap skills — click a skill if you actually have it
          </p>
          {missing.length > 0 ? (
            <div className="flex flex-wrap gap-2">
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
            <p className="text-sm text-text-muted">No gap skills were recorded.</p>
          )}
        </div>
      </div>

      {(requirements.length > 0 || niceToHave.length > 0) && (
        <div className="mt-6 grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
          <BulletColumn title="Required" items={requirements} />
          <BulletColumn title="Preferred" items={niceToHave} />
        </div>
      )}
    </section>
  );
}
