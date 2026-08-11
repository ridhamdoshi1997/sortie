"use client";

import { Sparkles } from "lucide-react";

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
  const { isPending, send } = useDocumentChat({ jobId, kind, onRevised });

  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          disabled={isPending}
          onClick={() => send(preset.prompt)}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          <Sparkles className="h-3 w-3 text-accent" />
          {preset.label}
        </button>
      ))}
    </div>
  );
}
