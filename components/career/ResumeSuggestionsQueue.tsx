"use client";

import { useState, useTransition } from "react";
import { Check, Copy, RefreshCcw, X } from "lucide-react";

import { acceptResumeSuggestion, rejectResumeSuggestion, type ResumeSuggestionRow } from "@/actions/resumeSuggestions";

// §Q4c Always-warm résumé — review queue for background-generated bullet
// suggestions. Visually mirrors EditorTab.tsx's own Was/Now diff-card
// language (that component is private to the résumé editor, so this is a
// parallel implementation, not a shared import) — Accept marks a suggestion
// reviewed and copies it to the clipboard, ready to paste into whichever
// résumé the user is actually editing. Never auto-inserted anywhere.
function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: ResumeSuggestionRow;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function handleAccept(): void {
    navigator.clipboard.writeText(suggestion.suggested_bullet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
    startTransition(async () => {
      await acceptResumeSuggestion(suggestion.id);
      onAccept(suggestion.id);
    });
  }

  function handleReject(): void {
    startTransition(async () => {
      await rejectResumeSuggestion(suggestion.id);
      onReject(suggestion.id);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-agent/30 bg-agent-light/50 p-3.5">
      <p className="text-xs font-medium text-text-muted">
        From: <span className="text-text-secondary">{suggestion.accomplishmentTitle}</span>
      </p>
      <div className="flex items-start gap-1.5 text-xs leading-6 text-agent-dark">
        <span className="mt-0.5 shrink-0 font-mono text-[9px] uppercase tracking-wide text-agent">Suggested bullet</span>
      </div>
      <p className="text-sm leading-6 text-agent-dark">{suggestion.suggested_bullet}</p>
      <div className="flex items-center gap-3 pt-0.5">
        <button
          type="button"
          disabled={isPending}
          onClick={handleAccept}
          className="inline-flex items-center gap-1 rounded-md bg-agent px-2.5 py-1 text-[11px] font-medium text-agent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {copied ? <Copy className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {copied ? "Copied" : "Accept & copy"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleReject}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-error disabled:opacity-50"
        >
          <X className="h-3 w-3" /> Discard
        </button>
      </div>
    </div>
  );
}

export function ResumeSuggestionsQueue({ initialSuggestions }: { initialSuggestions: ResumeSuggestionRow[] }) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);

  if (suggestions.length === 0) return null;

  function handleResolved(id: string): void {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <RefreshCcw className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Résumé Suggestions</h2>
      </div>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        Drafted from your recent accomplishments — accept to copy a ready-to-paste bullet into any résumé, or
        discard it.
      </p>
      <div className="flex flex-col gap-2.5">
        {suggestions.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} onAccept={handleResolved} onReject={handleResolved} />
        ))}
      </div>
    </section>
  );
}
