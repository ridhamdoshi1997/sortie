"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Gift, Loader2, Sparkles } from "lucide-react";

import { getOrCreateReferralCode, getReferralStats } from "@/actions/referrals";
import { generateReferralMessage } from "@/actions/referralCopy";
import type { ReferralChannel } from "@/lib/referralCopy";

const CHANNELS: Array<{ key: ReferralChannel; label: string }> = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "twitter", label: "X / Twitter" },
  { key: "email", label: "Email" },
];

export function ReferralsTab() {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<{ invitedCount: number; multiplier: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [channel, setChannel] = useState<ReferralChannel>("linkedin");
  const [draft, setDraft] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    getOrCreateReferralCode().then((result) => {
      if (result.success) setCode(result.code);
      else setError(result.error);
    });
    getReferralStats().then((result) => {
      if (result.success) setStats({ invitedCount: result.invitedCount, multiplier: result.multiplier });
    });
  }, []);

  const link = code ? `${window.location.origin}/?ref=${code}` : null;

  function handleCopyLink(): void {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleGenerate(): void {
    if (!code) return;
    setGenError(null);
    setDraft(null);
    startGenerating(async () => {
      const result = await generateReferralMessage(channel, `${window.location.origin}/?ref=${code}`);
      if (result.success) setDraft(result.message);
      else setGenError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-text-primary">Referrals</h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Share your link — when a friend signs up and completes their profile, your daily AI limits get a small permanent boost.
        </p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {code ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
          <code className="min-w-0 flex-1 truncate text-xs text-text-primary">{link}</code>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        !error && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Setting up your link…
          </div>
        )
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Friends invited</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{stats.invitedCount}</p>
          </div>
          <div className="rounded-lg border border-agent/30 bg-agent-light/50 px-3 py-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-agent-dark">Current AI limit boost</p>
            <p className="mt-1 text-lg font-semibold text-agent-dark">{Math.round((stats.multiplier - 1) * 100)}%</p>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-5">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-agent" />
          <p className="text-sm font-medium text-text-primary">Draft a message to share</p>
        </div>
        <div className="mt-3 flex gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChannel(c.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                channel === c.key ? "bg-accent text-accent-foreground" : "border border-border text-text-secondary hover:bg-surface-secondary"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!code || isGenerating}
          onClick={handleGenerate}
          className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-agent/30 bg-agent-light px-4 text-sm font-medium text-agent-dark transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {isGenerating ? "Drafting…" : "Generate with AI"}
        </button>
        {genError && <p className="mt-2 text-xs text-error">{genError}</p>}
        {draft && (
          <div className="mt-3 whitespace-pre-line rounded-lg border border-border bg-surface px-3 py-3 text-sm leading-6 text-text-secondary">
            {draft}
          </div>
        )}
      </div>
    </div>
  );
}
