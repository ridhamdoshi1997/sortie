"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { FrameworkPicker } from "@/components/documents/FrameworkPicker";
import type { ResumeSection } from "@/types/resumeEditor";

// The always-visible entry point to the bullet frameworks (Phase 53).
//
// The frameworks existed before this and were effectively unreachable: one
// route was three clicks deep inside the Editor tab on an individual bullet
// row, and the other only appeared if the résumé happened to contain
// placeholder blanks. On a clean résumé there was NO way to pick CAR, STAR,
// PAR, SOAR or XYZ at all. The user asked where the option was twice before
// this existed, which is the whole justification for it.
//
// Two steps: choose which bullet, then choose the framework and answer what
// it asks for. Bullet first, because the framework's questions are about
// that specific bullet — asking them before knowing which one produces
// answers with nothing to attach to.

type Props = {
  sections: ResumeSection[];
  pending: boolean;
  onApply: (instruction: string) => void;
  onClose: () => void;
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

export function FrameworkRewritePanel({ sections, pending, onApply, onClose }: Props) {
  const [target, setTarget] = useState<BulletRef | null>(null);
  const bullets = collectBullets(sections);

  if (bullets.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-[11px] text-text-muted">No work-experience bullets to rewrite yet.</p>
        <button type="button" onClick={onClose} className="mt-2 text-[11px] text-text-muted hover:text-text-primary">
          Close
        </button>
      </div>
    );
  }

  if (target) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setTarget(null)}
          className="mb-1.5 inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          Pick a different bullet
        </button>
        <FrameworkPicker bulletText={target.text} pending={pending} onApply={onApply} onClose={onClose} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-text-primary">Which bullet do you want to restructure?</p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            Pick one, then choose a framework — Google XYZ, CAR, PAR, STAR or SOAR — and it will tell you exactly what it
            needs before writing anything.
          </p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-[11px] text-text-muted hover:text-text-primary">
          Close
        </button>
      </div>

      <div className="mt-2.5 flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto pr-1">
        {bullets.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setTarget(b)}
            className="rounded-md border border-border bg-surface-secondary/40 px-2.5 py-2 text-left transition-colors hover:border-accent"
          >
            <span className="block font-mono text-[10px] uppercase tracking-wide text-text-muted">{b.company}</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-text-secondary">{b.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
