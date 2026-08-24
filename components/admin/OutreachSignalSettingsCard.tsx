"use client";

import { useState, useTransition } from "react";
import { Radio } from "lucide-react";

import type { EnrichmentProvider, OutreachSignalSettings } from "@/lib/admin/outreachSettings";
import { setOutreachSignalProviderAction } from "@/actions/adminOutreachSettings";

const PROVIDERS: Array<{ key: EnrichmentProvider; label: string }> = [
  { key: "clay", label: "Clay" },
  { key: "apollo", label: "Apollo" },
];

// Inert-until-a-real-key-exists scaffold (Phase 18 item 5) — same pattern
// as this app's Sentry/Resend integrations. No agent can create a paid
// Clay/Apollo account, so this ships wired but dormant: real, free
// hiring-velocity signals work today (job detail pages), person-level
// enrichment activates automatically the moment a real ENRICHMENT_API_KEY
// env var is set — no further code changes needed then.
export function OutreachSignalSettingsCard({ initial, canWrite }: { initial: OutreachSignalSettings; canWrite: boolean }) {
  const [provider, setProvider] = useState(initial.provider);
  const [isPending, startTransition] = useTransition();

  function handlePick(next: EnrichmentProvider): void {
    setProvider(next);
    startTransition(async () => {
      await setOutreachSignalProviderAction(next);
    });
  }

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-semibold text-text-primary">Outreach signal enrichment</h2>
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        Free hiring-velocity signals (rising posting volume per company) already run on every job page — no setup needed. Person-level contact
        enrichment via Clay or Apollo needs a paid account; wire it up whenever you have one.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            initial.isConfigured ? "bg-agent-light text-agent-dark" : "bg-surface-secondary text-text-secondary"
          }`}
        >
          {initial.isConfigured ? "Enrichment key configured" : "Not configured — free signals only"}
        </span>
        {!initial.isConfigured && (
          <span className="text-xs text-text-muted">Set the ENRICHMENT_API_KEY env var to activate.</span>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={!canWrite || isPending}
            onClick={() => handlePick(p.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              provider === p.key ? "bg-accent text-accent-foreground" : "border border-border text-text-secondary hover:bg-surface-secondary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
