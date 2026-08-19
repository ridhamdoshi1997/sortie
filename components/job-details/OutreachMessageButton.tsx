"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Sparkles } from "lucide-react";

import { generateOutreachMessageAction } from "@/actions/outreachMessage";

type Props = {
  jobId: string;
  personName: string;
  personTitle: string | null;
  connectionReason: string | null;
};

// Per-contact outreach message drafts (build-plan.md §F) — completes the
// "discovery + outreach drafts" pair, discovery already shipped via
// InsiderConnections. Same popover-on-a-small-icon-button pattern as
// EmailLookupButton.tsx, this app's own established convention for a
// per-person inline action on these contact rows.
export function OutreachMessageButton({ jobId, personName, personTitle, connectionReason }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    if (message) return;
    setError(null);
    startTransition(async () => {
      const result = await generateOutreachMessageAction(jobId, personName, personTitle, connectionReason);
      if (result.success) setMessage(result.message);
      else setError(result.error);
    });
  }

  function handleCopy(): void {
    if (!message) return;
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        title="Draft outreach message"
        aria-label="Draft outreach message"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-agent/40 bg-agent-light text-agent-dark transition-colors hover:opacity-90 disabled:opacity-60"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </button>

      {error && (
        <p className="absolute right-0 top-8 z-10 w-40 text-right text-xs text-error">{error}</p>
      )}

      {message && (
        <div className="absolute right-0 top-8 z-10 w-64 rounded-lg border border-agent/30 bg-agent-light p-3 shadow-card">
          <p className="text-sm leading-5 text-agent-dark">{message}</p>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-2 inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-[11px] font-medium text-agent-dark transition-opacity hover:opacity-90"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
