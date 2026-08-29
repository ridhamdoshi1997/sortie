"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";

import { updateModelConfig, type ModelConfigRow } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Claude",
};

// Admin-editable AI model config (direct user request, 2026-08-29) — a flat
// list of (provider, tier) -> model id rows, same "draft state locally,
// send the whole thing back on an explicit Save" pattern PlansManager.tsx's
// DailyActionLimitsEditor/RegionalPricingEditor already established, minus
// their JSONB flat-map machinery — this is a plain table, not a per-plan
// override map, so it's simpler: no string-sentinel parsing, just one text
// input per row. Gated behind ConfirmDialog because a save here changes
// which model every user's next AI call actually runs on, immediately.
export function AiModelsManager({ initialRows }: { initialRows: ModelConfigRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function updateRow(provider: string, tier: string, modelId: string) {
    setRows((prev) => prev.map((r) => (r.provider === provider && r.tier === tier ? { ...r, modelId } : r)));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateModelConfig(rows);
      if (!result.success) {
        setError(result.error ?? "Failed to save model config");
        return;
      }
      setConfirming(false);
      setSavedAt(Date.now());
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">AI models</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Which model id backs each provider&apos;s fast/smart tier — read live on every AI call (lib/models.ts), no
          redeploy needed. A row falls back to the hardcoded default if this table can&apos;t be reached.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Provider</th>
              <th className="py-2 pr-4 font-medium">Tier</th>
              <th className="py-2 font-medium">Model id</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.provider}-${row.tier}`} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-4 text-foreground">{PROVIDER_LABELS[row.provider] ?? row.provider}</td>
                <td className="py-2 pr-4 capitalize text-muted-foreground">{row.tier}</td>
                <td className="py-2">
                  <input
                    type="text"
                    value={row.modelId}
                    onChange={(e) => updateRow(row.provider, row.tier, e.target.value)}
                    className="w-full rounded-lg border border-input bg-transparent px-2 py-1 font-mono text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn-signal inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          <Save className="h-4 w-4" aria-hidden />
          Save changes
        </button>
        {savedAt && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Update AI model config?"
        description="This changes which model every user's next AI call runs on immediately — no redeploy, no rollback beyond editing this again."
        confirmLabel="Save changes"
        tone="neutral"
        pending={isPending}
        error={error}
        onConfirm={handleSave}
        onCancel={() => {
          setConfirming(false);
          setError(null);
        }}
      />
    </div>
  );
}
