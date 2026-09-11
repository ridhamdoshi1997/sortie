"use client";

import { AlertCircle, Loader2, Sparkles } from "lucide-react";

import { useDocumentChat, type RevisedData } from "@/components/documents/useDocumentChat";

export type ChipPreset = { label: string; prompt: string };

const DEFAULT_PRESETS: ChipPreset[] = [
  { label: "Use stronger action verbs throughout", prompt: "Use stronger action verbs throughout" },
  { label: "Shorten the professional summary to 2 sentences", prompt: "Shorten the professional summary to 2 sentences" },
  { label: "Cut filler words from the bullet points", prompt: "Cut filler words from the bullet points" },
  { label: "Make the bullets more quantified and results-focused", prompt: "Make the bullets more quantified and results-focused" },
];

type Props = {
  jobId: string;
  kind?: "resume" | "cover_letter";
  // Defaults to generic quality-improvement presets; pass a custom list
  // (e.g. one per missing keyword, or cover-letter tone presets) to
  // repurpose the same one-tap-chip mechanism for a different goal.
  presets?: ChipPreset[];
  onRevised?: (data: RevisedData) => void;
};

// One-tap presets routed through the exact same /api/documents/chat round
// trip DocumentChatEditor uses (via the shared useDocumentChat hook) —
// nearly free to build, far more discoverable than a blank text box.
export function RefinementChips({ jobId, kind = "resume", presets = DEFAULT_PRESETS, onRevised }: Props) {
  // `error` is read and rendered, not dropped. These chips hit the exact
  // same route as the Action Plan, so they had the exact same bug: a failed
  // revision un-greyed the chip and changed nothing, with no explanation.
  const { isPending, send, error } = useDocumentChat({ jobId, kind, onRevised });

  return (
    <div>
      {/* Every one of these spends a full document_generation — the same
          unit EditorUsageMeter shows as "N of 10 left today", and the same
          cost as the Action Plan's AI item. They looked free because nothing
          said otherwise, which is how a user burns a daily allowance on
          four one-tap chips without realising. */}
      <p className="mb-1.5 text-[10px] text-text-muted">Each uses 1 generation from your daily allowance.</p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            disabled={isPending}
            onClick={() => send(preset.prompt)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin text-accent" />
            ) : (
              <Sparkles className="h-3 w-3 text-accent" />
            )}
            {preset.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-error/30 bg-error/5 px-2.5 py-2 text-[11px] text-error">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
