"use client";

import { useEffect, useState } from "react";

import { AiThinkingCard, SignalProgressBar } from "@/components/ui/SignalLoaders";
import { GenerationProgress } from "@/components/ui/GenerationProgress";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { showToast } from "@/components/ui/ToastProvider";

// Design-decision surface for the Signal loaders, toasts and modal.
// Deliberately shows the NEW loaders next to the one already shipped and
// live in 4 real flows (GenerationProgress) — Phase 21's loader was
// rejected after being judged in isolation, and the real question here is
// "is this better than what we already have?", which needs both on screen
// at once. Nothing on this page is wired to the backend; /preview is
// gated to non-production by app/preview/layout.tsx.

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="whitespace-nowrap text-[13px] font-bold text-text-primary">{title}</h2>
        <span className="h-px flex-1 bg-border" />
      </div>
      {note && <p className="max-w-2xl text-xs leading-5 text-text-muted">{note}</p>}
      {children}
    </section>
  );
}

export default function LoadersPreviewPage() {
  // A real counter, not a fake percentage — the determinate bar is only
  // ever honest if something real is being counted.
  const [done, setDone] = useState(0);
  const total = 24;
  const [confirmOpen, setConfirmOpen] = useState<"neutral" | "danger" | null>(null);

  useEffect(() => {
    if (done >= total) return;
    const t = setTimeout(() => setDone((n) => n + 1), 420);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-widest text-text-muted">
          Design review · not wired to anything
        </p>
        <h1 className="font-display mt-1 text-3xl font-bold text-text-primary">Signal loaders</h1>
      </div>

      <Block
        title="A · Determinate progress (new)"
        note="Only valid when there's a real count behind it — here, jobs evaluated out of a real batch. Restarts when it completes so you can watch the fill."
      >
        <SignalProgressBar label="Evaluating your search results" value={done} total={total} />
        <button
          type="button"
          onClick={() => setDone(0)}
          className="w-fit rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          Replay
        </button>
      </Block>

      <Block
        title="B · Indeterminate 'AI is thinking' (new)"
        note="For a single opaque AI call where no honest percentage exists. Agent-teal, because it represents AI work."
      >
        <AiThinkingCard status="Reading your pipeline snapshot…" />
      </Block>

      <Block
        title="C · What ships today, for comparison"
        note="GenerationProgress — already live in Document Generator, Brag Doc, Resume Fit and Company Research. This is the thing A and B would replace or sit alongside. Judge A and B against this, not against nothing."
      >
        <GenerationProgress
          title="Generating your cover letter"
          stages={["Reading the job description…", "Pulling your logged accomplishments…", "Drafting…"]}
          timeEstimate="Usually about 20 seconds"
          usageRemaining="4 of 5 left today"
        />
      </Block>

      <Block title="D · Toasts (Sonner, headless)" note="Click to fire. Agent-teal is reserved for AI-authored notifications.">
        <div className="flex flex-wrap gap-2">
          {(["success", "error", "info", "agent"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => showToast(`This is a ${v} toast`, v)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
            >
              {v}
            </button>
          ))}
        </div>
      </Block>

      <Block
        title="E · Confirm modal"
        note="Signal chrome on both: scrim blur-in, card lift-in, serif title, right-aligned actions. Two tones on purpose — a reversible action gets the amber primary, a destructive one keeps error-red so 'Delete' never looks like a friendly primary button."
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen("neutral")}
            className="btn-signal w-fit rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground"
          >
            Neutral — mark unavailable
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen("danger")}
            className="w-fit rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            Destructive — delete
          </button>
        </div>

        <ConfirmDialog
          open={confirmOpen === "neutral"}
          tone="neutral"
          title="Mark this job unavailable?"
          description="This won't affect its match score or your notes — it'll just stop counting toward your active pipeline until you undo it."
          confirmLabel="Mark unavailable"
          onConfirm={() => setConfirmOpen(null)}
          onCancel={() => setConfirmOpen(null)}
        />
        <ConfirmDialog
          open={confirmOpen === "danger"}
          tone="danger"
          title="Delete this accomplishment?"
          description="It will be permanently removed from your career record. This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => setConfirmOpen(null)}
          onCancel={() => setConfirmOpen(null)}
        />
      </Block>
    </main>
  );
}
