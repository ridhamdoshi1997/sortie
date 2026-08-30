"use client";

import { useState, useTransition } from "react";
import { Check, X, Send } from "lucide-react";

import { updateAffiliateApplication, payAffiliateNow, type AffiliateRow } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-agent-light text-agent-dark",
  rejected: "bg-surface-secondary text-text-muted",
};

// Affiliate program admin UI (direct user request, 2026-08-30) — approve/
// reject applicants, adjust their commission rate, and trigger a real
// PayPal payout for their unpaid balance. The "Pay now" click is the ONLY
// path that can ever send real money — gated behind ConfirmDialog since
// it's irreversible once PayPal accepts the batch.
export function AffiliatesManager({ initialRows }: { initialRows: AffiliateRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [payConfirm, setPayConfirm] = useState<AffiliateRow | null>(null);
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({});

  function handleDecision(row: AffiliateRow, status: "approved" | "rejected") {
    setError(null);
    const rateInput = rateEdits[row.id];
    const rate = rateInput !== undefined ? Number(rateInput) / 100 : undefined;
    startTransition(async () => {
      const result = await updateAffiliateApplication(row.id, status, rate);
      if (!result.success) {
        setError(result.error ?? "Failed to update this affiliate");
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status, commissionRate: rate ?? r.commissionRate } : r)));
    });
  }

  function handlePayNow() {
    if (!payConfirm) return;
    setError(null);
    startTransition(async () => {
      const result = await payAffiliateNow(payConfirm.id);
      if (!result.success) {
        setError(result.error ?? "Payout failed");
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === payConfirm.id ? { ...r, unpaidCents: 0, paidCents: r.paidCents + r.unpaidCents } : r)));
      setPayConfirm(null);
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Affiliates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Approve applicants, set their commission rate, and pay out their unpaid balance via PayPal.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Affiliate</th>
              <th className="py-2 pr-4 font-medium">Code</th>
              <th className="py-2 pr-4 font-medium">PayPal</th>
              <th className="py-2 pr-4 font-medium">Rate %</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Unpaid</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-4 text-foreground">{row.email ?? row.userId}</td>
                <td className="py-2 pr-4 font-mono text-muted-foreground">{row.affiliateCode}</td>
                <td className="py-2 pr-4 text-muted-foreground">{row.paypalEmail}</td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={Math.round(row.commissionRate * 100)}
                    onChange={(e) => setRateEdits((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    className="w-16 rounded-lg border border-input bg-transparent px-2 py-1 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </td>
                <td className="py-2 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[row.status] ?? ""}`}>
                    {row.status}
                  </span>
                </td>
                <td className="py-2 pr-4 text-foreground">{formatCents(row.unpaidCents)}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    {row.status !== "approved" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDecision(row, "approved")}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                    )}
                    {row.status !== "rejected" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDecision(row, "rejected")}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                    )}
                    {row.status === "approved" && row.unpaidCents > 0 && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setPayConfirm(row)}
                        className="btn-signal inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent-foreground"
                      >
                        <Send className="h-3 w-3" /> Pay now
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  No affiliate applications yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={payConfirm !== null}
        title={`Pay ${payConfirm ? formatCents(payConfirm.unpaidCents) : ""} to this affiliate?`}
        description={`Sends a real PayPal payout to ${payConfirm?.paypalEmail} for their full unpaid balance. This cannot be undone once PayPal accepts it.`}
        confirmLabel="Send payout"
        tone="neutral"
        pending={isPending}
        error={error}
        onConfirm={handlePayNow}
        onCancel={() => {
          setPayConfirm(null);
          setError(null);
        }}
      />
    </div>
  );
}
