"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, PenLine } from "lucide-react";

import { RESUME_FRAMEWORKS, buildFrameworkPrompt, type ResumeFramework } from "@/lib/resumeFrameworks";
import { DAILY_LIMITS } from "@/lib/usage";

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
// This component deliberately does NOT make its own AI call. It emits an
// instruction string into the editor's existing per-bullet rewrite path, so
// the result arrives in the same diff card with the same accept/reject the
// user already knows — and it spends a cheap `bullet_rewrite` rather than a
// whole-résumé `document_generation`. The instruction lands in the user
// prompt, where USER_INSTRUCTION_PRECEDENCE already makes it outrank the
// house style while the no-fabrication rule stays absolute.

type Props = {
  bulletText: string;
  pending: boolean;
  onApply: (instruction: string) => void;
  onClose: () => void;
};

export function FrameworkPicker({ bulletText, pending, onApply, onClose }: Props) {
  const [selected, setSelected] = useState<ResumeFramework | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // At least one answer is required. Applying a framework with nothing
  // supplied is precisely the situation that produced placeholders.
  const hasAnyAnswer = Object.values(answers).some((v) => v.trim().length > 0);

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

      <p className="mt-2.5 text-[11px] text-text-secondary">
        Answer what you can — anything left blank is simply left out, never guessed at.
      </p>

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
          {hasAnyAnswer ? `1 of ${DAILY_LIMITS.bullet_rewrite}/day` : "Fill in at least one field"}
        </span>
      </div>
    </div>
  );
}
