"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, PenLine, Sparkles } from "lucide-react";

import { inferFrameworkAnswers } from "@/actions/profile";
import { RESUME_FRAMEWORKS, buildFrameworkPrompt, getFramework, type ResumeFramework } from "@/lib/resumeFrameworks";

// Opt-in bullet frameworks (Phase 53).
//
// Direct user instruction: "make options for user to apply the google xyz
// method — if user agrees then explain what needed and then user feeds the
// data and then you will apply the xyz method. Remove the by-default
// techniques."
//
// Three steps, in this order on purpose: PICK a framework (with its real
// documented weakness shown, not just its pitch), SEE exactly what it needs
// from you, then SUPPLY that data — and only then is it applied.
//
// The sequencing is the entire point. XYZ used to be applied to every bullet
// automatically, and because a framework demands inputs the résumé does not
// contain, the model filled the gaps with "[X]%" and produced a document
// full of blanks. Collecting the inputs FIRST is what turns a framework from
// a blank-generator into something usable.
//
// Applying (manual or auto-filled) emits an instruction string into the
// editor's existing per-bullet rewrite path, so the result arrives in the
// same diff card with the same accept/reject the user already knows — and
// it spends a cheap `bullet_rewrite` rather than a whole-résumé
// `document_generation`. The instruction lands in the user prompt, where
// USER_INSTRUCTION_PRECEDENCE already makes it outrank the house style
// while the no-fabrication rule stays absolute.
//
// "Auto-fill with AI" DOES make its own call (inferFrameworkAnswers,
// actions/profile.ts) — but only to fill the visible fields below, never to
// apply anything. Direct user report on the earlier design (skip straight to
// applying, no visible feedback until the whole-résumé chat call finished):
// "no user ui showing... user will stop using it immediately."

type Props = {
  bulletText: string;
  company: string;
  title: string;
  pending: boolean;
  onApply: (instruction: string) => void;
  onClose: () => void;
};

export function FrameworkPicker({ bulletText, company, title, pending, onApply, onClose }: Props) {
  // STAR pre-selected (direct user request) — jumps straight to its
  // questions instead of making everyone choose from 5 every time. "All
  // frameworks" below still reaches the other four.
  const [selected, setSelected] = useState<ResumeFramework | null>(() => getFramework("star") ?? null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [autofilling, setAutofilling] = useState(false);
  const [autofillError, setAutofillError] = useState<string | null>(null);

  // At least one answer is required. Applying a framework with nothing
  // supplied is precisely the situation that produced placeholders.
  const hasAnyAnswer = Object.values(answers).some((v) => v.trim().length > 0);

  // Fills the visible fields below, in place — same fix as FrameworkBar's:
  // the old design skipped straight to applying with no visible feedback
  // until the whole-résumé chat call finished. This is a separate, fast,
  // single-bullet call — the user sees and can edit what the AI inferred.
  async function handleAutofill(): Promise<void> {
    if (!selected) return;
    setAutofillError(null);
    setAutofilling(true);
    try {
      const result = await inferFrameworkAnswers(selected, bulletText, { title, company });
      if (result.success && result.answers) {
        setAnswers((prev) => ({ ...prev, ...result.answers }));
      } else {
        setAutofillError(result.error ?? "Auto-fill failed. Try answering manually instead.");
      }
    } catch {
      setAutofillError("Auto-fill failed. Try answering manually instead.");
    } finally {
      setAutofilling(false);
    }
  }

  if (!selected) {
    return (
      <div className="rounded-lg border border-border bg-surface-secondary/40 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-text-primary">Rewrite with a proven framework</p>
            <p className="mt-0.5 text-[11px] text-text-muted">
              None of these run automatically. Pick one and it will tell you exactly what it needs before writing anything.
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-[11px] text-text-muted hover:text-text-primary">
            Cancel
          </button>
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5">
          {RESUME_FRAMEWORKS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelected(f)}
              className="rounded-lg border border-border bg-surface px-2.5 py-2 text-left transition-colors hover:border-accent"
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[11px] font-medium text-text-primary">{f.name}</span>
                <span className="font-mono text-[10px] text-text-muted">{f.expansion}</span>
              </span>
              <span className="mt-0.5 block text-[11px] text-text-secondary">{f.summary}</span>
              {/* Weakness shown at CHOOSING time, not buried afterwards. A
                  framework that is wrong for someone's level (SOAR on a
                  junior role) produces worse writing, and they can only
                  avoid that if they see it before committing. */}
              <span className="mt-1 block text-[10px] leading-relaxed text-text-muted">
                <span className="text-text-secondary">Best for:</span> {f.bestFor}
                <br />
                <span className="text-warning">Watch out:</span> {f.weakness}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-secondary/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          All frameworks
        </button>
        <button type="button" onClick={onClose} className="text-[11px] text-text-muted hover:text-text-primary">
          Cancel
        </button>
      </div>

      <p className="mt-2 text-xs font-medium text-text-primary">
        {selected.name} <span className="font-mono text-[10px] font-normal text-text-muted">{selected.expansion}</span>
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
        <span className="text-text-secondary">Example:</span> {selected.example}
      </p>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] text-text-secondary">
          Answer what you can — anything left blank is simply left out, never guessed at.
        </p>
        <button
          type="button"
          onClick={handleAutofill}
          disabled={autofilling}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-agent/40 bg-agent-muted px-2 text-[10px] font-medium text-agent-dark transition-colors hover:bg-agent-light disabled:opacity-50"
          title="Let AI infer these from the bullet itself, using nothing it doesn't already say"
        >
          {autofilling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {autofilling ? "Filling in…" : "Auto-fill with AI"}
        </button>
      </div>
      {autofillError && <p className="mt-1 text-[10px] text-error">{autofillError}</p>}

      <div className="mt-2 flex flex-col gap-2">
        {selected.questions.map((q) => (
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
          onClick={() => onApply(buildFrameworkPrompt(selected, bulletText, answers))}
          disabled={pending || !hasAnyAnswer}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-accent-foreground disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PenLine className="h-3 w-3" />}
          {pending ? "Rewriting…" : `Apply ${selected.name}`}
        </button>
        <span className="text-[10px] text-text-muted">
          {hasAnyAnswer ? "Uses 1 bullet rewrite" : "Fill in at least one field"}
        </span>
      </div>
    </div>
  );
}
