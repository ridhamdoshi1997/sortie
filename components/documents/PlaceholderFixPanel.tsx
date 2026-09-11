"use client";

import { useMemo, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

import { RESUME_FRAMEWORKS, type FrameworkId } from "@/lib/resumeFrameworks";
import type { ResumeSection } from "@/types/resumeEditor";

// One workspace for every bullet left holding a blank (Phase 53).
//
// Replaces seven identical "Fill in a placeholder blank" rows in the Action
// Plan. The user's verdict on that was blunt and correct: "we can't ask this
// way to user, it's pathetic way to give the options." It was — seven rows
// with the same label, each truncated mid-sentence so the bullet could not
// be read, each needing its own click and its own AI call, and between them
// they pushed every genuinely valuable item out of the plan.
//
// The real job is not seven decisions, it is ONE: the résumé is missing
// numbers, and the person reading it is the only one who has them. So show
// every gap on one screen, let them type the real figures, and fix the lot
// in a single pass. Skipping is first-class — a bullet with no honest number
// gets rewritten without one rather than keeping a blank.

export type PlaceholderBullet = {
  key: string;
  company: string;
  bulletText: string;
  /** The bracketed fragment itself, e.g. "[X]%" — shown so the gap is obvious. */
  blank: string;
};

const PLACEHOLDER_GLOBAL = /\[(?:[XYZxyz]|\$[^\]]*|(?:add|insert|enter|your|metric|number|amount|percent)[^\]]*)\]/g;

export function findPlaceholderBullets(sections: ResumeSection[]): PlaceholderBullet[] {
  const out: PlaceholderBullet[] = [];
  for (const section of sections) {
    if (!section.visible || section.type !== "work_experience") continue;
    for (const entry of section.entries) {
      (entry.bullets ?? []).forEach((b, i) => {
        if (!b) return;
        const matches = b.match(PLACEHOLDER_GLOBAL);
        if (!matches) return;
        out.push({
          key: `${entry.company ?? ""}-${i}-${b.slice(0, 24)}`,
          company: entry.company ?? "",
          bulletText: b,
          blank: matches[0],
        });
      });
    }
  }
  return out;
}

/** Splits a bullet so the blank can be rendered distinctly from its text. */
function segments(bullet: string): { text: string; isBlank: boolean }[] {
  const parts: { text: string; isBlank: boolean }[] = [];
  let last = 0;
  for (const m of bullet.matchAll(PLACEHOLDER_GLOBAL)) {
    if (m.index === undefined) continue;
    if (m.index > last) parts.push({ text: bullet.slice(last, m.index), isBlank: false });
    parts.push({ text: m[0], isBlank: true });
    last = m.index + m[0].length;
  }
  if (last < bullet.length) parts.push({ text: bullet.slice(last), isBlank: false });
  return parts;
}

type Props = {
  bullets: PlaceholderBullet[];
  pending: boolean;
  onApply: (instruction: string) => void;
  onClose: () => void;
};

export function PlaceholderFixPanel({ bullets, pending, onApply, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [frameworkId, setFrameworkId] = useState<FrameworkId | "">("");

  const framework = useMemo(() => RESUME_FRAMEWORKS.find((f) => f.id === frameworkId), [frameworkId]);
  const filled = bullets.filter((b) => (values[b.key] ?? "").trim().length > 0).length;

  function buildInstruction(): string {
    const lines = bullets.map((b) => {
      const value = (values[b.key] ?? "").trim();
      return value
        ? `- ${b.company}: "${b.bulletText}"\n  REAL VALUE for ${b.blank}: ${value}`
        : `- ${b.company}: "${b.bulletText}"\n  NO NUMBER AVAILABLE — rewrite this one WITHOUT any figure.`;
    });

    return [
      `My résumé has ${bullets.length} bullet${bullets.length === 1 ? "" : "s"} containing placeholder blanks. Fix every one of them in this single pass.`,
      "",
      ...lines,
      "",
      "RULES:",
      "- Where I gave a real value, substitute it EXACTLY as I wrote it. Do not round, rescale or reword the number.",
      "- Where I said no number is available, rewrite that bullet so it reads as finished writing with no figure at all — carry the weight with concrete scope instead. Do NOT leave the blank in, and do NOT invent a number.",
      "- Every bullet you return must be sendable to an employer exactly as written. No brackets, no blanks, no ellipses standing in for a value.",
      framework
        ? `- Structure each rewritten bullet using the ${framework.name} framework (${framework.expansion}). ${framework.instruction}`
        : "- Keep each bullet's existing structure; change only what is needed to remove the blank.",
      "",
      "Tell me which bullets you changed and what you did with each.",
    ].join("\n");
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-text-primary">
            {bullets.length} bullet{bullets.length === 1 ? "" : "s"} still have a blank
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            These were written before placeholders were banned. Type the real figure where you have one — leave it empty
            and that bullet gets rewritten without a number instead. Nothing is invented either way.
          </p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-[11px] text-text-muted hover:text-text-primary">
          Close
        </button>
      </div>

      <div className="mt-3 flex max-h-[46vh] flex-col gap-2.5 overflow-y-auto pr-1">
        {bullets.map((b) => (
          <div key={b.key} className="rounded-md border border-border bg-surface-secondary/40 p-2.5">
            <p className="text-[11px] leading-relaxed text-text-secondary">
              {segments(b.bulletText).map((seg, i) =>
                seg.isBlank ? (
                  <span key={i} className="rounded bg-warning/15 px-1 font-mono text-warning">
                    {seg.text}
                  </span>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="shrink-0 font-mono text-[10px] text-text-muted">{b.blank} =</span>
              <input
                value={values[b.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [b.key]: e.target.value }))}
                placeholder="the real number — or leave blank to drop it"
                className="h-7 flex-1 rounded-md border border-border bg-surface px-2 text-[11px] text-text-primary outline-none focus-visible:border-accent"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Optional, and off by default. A framework is a structural choice the
          user opts into — applying one silently is what produced these blanks
          in the first place. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-text-secondary">Structure</label>
        <select
          value={frameworkId}
          onChange={(e) => setFrameworkId(e.target.value as FrameworkId | "")}
          className="h-7 rounded-md border border-border bg-surface px-2 text-[11px] text-text-primary outline-none focus-visible:border-accent"
        >
          <option value="">Keep as written</option>
          {RESUME_FRAMEWORKS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} — {f.expansion}
            </option>
          ))}
        </select>
        {framework && <span className="text-[10px] text-warning">Watch out: {framework.weakness}</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => onApply(buildInstruction())}
          disabled={pending}
          className="btn-signal inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-accent-foreground disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {pending ? "Rewriting…" : `Fix all ${bullets.length}`}
        </button>
        <span className="text-[10px] text-text-muted">
          {filled} of {bullets.length} filled · uses 1 rewrite for the whole batch
        </span>
      </div>
    </div>
  );
}
