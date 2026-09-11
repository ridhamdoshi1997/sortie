"use client";

import { useState } from "react";
import { ArrowLeft, Layers } from "lucide-react";

import { RESUME_FRAMEWORKS, buildFrameworkPrompt, type ResumeFramework } from "@/lib/resumeFrameworks";
import { DAILY_LIMITS } from "@/lib/usage";
import type { ResumeSection } from "@/types/resumeEditor";

// The visible, always-present way to choose a writing framework (Phase 53).
//
// The frameworks shipped genuinely unreachable: one route was three clicks
// deep on an individual bullet row inside the Editor tab, the other only
// appeared when the résumé happened to contain placeholder blanks. On a
// clean résumé there was no way to reach CAR, PAR, STAR, SOAR or XYZ at all.
// The user asked where the option was three times. An opt-in nobody can find
// is not opt-in, it is absent — so the names now sit on the surface, above
// the Action Plan and again at the top of the Editor tab.
//
// Order of steps is deliberate: FRAMEWORK first (that is the thing being
// asked for), then which bullet, then that framework's own questions. The
// questions are specific to one bullet, so asking them before a bullet is
// chosen would produce answers with nothing to attach to.

type Props = {
  sections: ResumeSection[];
  pending: boolean;
  /** Receives the fully-built instruction; each surface wires its own path. */
  onApply: (instruction: string) => void;
};

type BulletRef = { key: string; company: string; text: string };

function collectBullets(sections: ResumeSection[]): BulletRef[] {
  const out: BulletRef[] = [];
  for (const section of sections) {
    if (!section.visible || section.type !== "work_experience") continue;
    for (const entry of section.entries) {
      (entry.bullets ?? []).forEach((b, i) => {
        if (b?.trim()) out.push({ key: `${entry.company ?? ""}-${i}`, company: entry.company ?? "", text: b });
      });
    }
  }
  return out;
}

export function FrameworkBar({ sections, pending, onApply }: Props) {
  const [framework, setFramework] = useState<ResumeFramework | null>(null);
  const [bullet, setBullet] = useState<BulletRef | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const bullets = collectBullets(sections);
  if (bullets.length === 0) return null;

  function reset(): void {
    setFramework(null);
    setBullet(null);
    setAnswers({});
  }

  const hasAnyAnswer = Object.values(answers).some((v) => v.trim().length > 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-accent" />
        <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">Writing framework</p>
      </div>

      {/* Step 1 — the names, always on screen. This is the bit that was
          missing: a user could not choose a technique they could not see. */}
      {!framework && (
        <>
          <p className="mt-1 text-[11px] text-text-muted">
            Optional, and never applied automatically. Pick one and it will tell you exactly what it needs before writing
            anything.
          </p>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {RESUME_FRAMEWORKS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFramework(f)}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:border-accent"
              >
                <span className="text-[11px] font-semibold text-text-primary">{f.name}</span>
                <span className="font-mono text-[10px] text-accent">{f.expansion}</span>
                <span className="w-full text-[10px] leading-relaxed text-text-muted">
                  {f.summary} <span className="text-warning">Watch out:</span> {f.weakness}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Step 2 — which bullet. */}
      {framework && !bullet && (
        <>
          <button
            type="button"
            onClick={reset}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
          >
            <ArrowLeft className="h-3 w-3" />
            All frameworks
          </button>
          {/* The formula is repeated HERE, not just on the previous screen.
              User report: "How this is XYZ?" — looking at a list of their
              existing bullets under a heading that said Google XYZ. The
              bullets are the INPUT, not the output, and nothing on screen
              said so. Showing the shape plus what happens next removes the
              ambiguity. */}
          <p className="mt-1.5 text-[11px] text-text-secondary">
            <span className="font-semibold text-text-primary">{framework.name}</span>{" "}
            <span className="font-mono text-[10px] text-accent">{framework.expansion}</span>
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
            These are your bullets as they read today. Pick the one you want rewritten into that shape — you&apos;ll be
            asked for {framework.questions.map((q) => q.slot).join(", ")} next, and nothing changes until you apply it.
          </p>
          <div className="mt-2 flex max-h-[36vh] flex-col gap-1.5 overflow-y-auto pr-1">
            {bullets.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setBullet(b)}
                className="rounded-md border border-border bg-surface-secondary/40 px-2.5 py-2 text-left transition-colors hover:border-accent"
              >
                <span className="block font-mono text-[10px] uppercase tracking-wide text-text-muted">{b.company}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-text-secondary">{b.text}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Step 3 — the framework's own questions, one per letter. THIS is how
          the X / Y / Z data actually gets collected: labelled inputs badged
          with the slot each answer fills, with a real example as the
          placeholder. Blank means that element is left out of the bullet, so
          a missing number can never become a bracket again. */}
      {framework && bullet && (
        <>
          <button
            type="button"
            onClick={() => setBullet(null)}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
          >
            <ArrowLeft className="h-3 w-3" />
            Pick a different bullet
          </button>

          <p className="mt-2 rounded-md bg-surface-secondary px-2.5 py-1.5 text-[11px] leading-relaxed text-text-secondary">
            {bullet.text}
          </p>
          <p className="mt-2 text-[11px] text-text-secondary">
            <span className="font-semibold text-text-primary">{framework.name}</span>{" "}
            <span className="font-mono text-[10px] text-accent">{framework.expansion}</span>
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
            Answer what you can — anything left blank is simply left out, never guessed at.
          </p>

          <div className="mt-2 flex flex-col gap-2">
            {framework.questions.map((q) => (
              <label key={q.id} className="block">
                <span className="mb-1 flex items-center gap-1.5 text-[11px] text-text-secondary">
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-accent/10 font-mono text-[9px] font-bold text-accent">
                    {q.slot}
                  </span>
                  {q.label}
                </span>
                <input
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder={q.placeholder}
                  className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus-visible:border-accent"
                />
              </label>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending || !hasAnyAnswer}
              onClick={() => {
                onApply(buildFrameworkPrompt(framework, bullet.text, answers));
                reset();
              }}
              className="btn-signal inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-accent-foreground disabled:opacity-60"
            >
              Apply {framework.name}
            </button>
            <span className="text-[10px] text-text-muted">
              {hasAnyAnswer ? `1 of ${DAILY_LIMITS.bullet_rewrite}/day` : "Fill in at least one field"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
