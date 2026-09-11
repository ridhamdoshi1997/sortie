"use client";

import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";

import { getUsageStats, type UsageStatRow } from "@/actions/usageStats";
import { getBillingSummary, type BillingSummary } from "@/actions/billing";

// Premium-feature (Apify/Browserbase) monthly usage — plan management and
// upgrade/downgrade live in Settings' own "Subscription" tab
// (components/settings/SubscriptionTab.tsx), not duplicated here; this tab
// stays scoped to "how much have I used," matching its existing daily-AI-usage
// section below.
function BillingBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isNearLimit = pct >= 80;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className={isNearLimit ? "font-medium text-warning" : "text-text-muted"}>
          {used} / {limit}/mo
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
        <div className={`h-full rounded-full ${isNearLimit ? "bg-warning" : "bg-agent"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PremiumUsageSection() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  useEffect(() => {
    getBillingSummary().then((result) => {
      if (result.success) setSummary(result.data);
    });
  }, []);

  if (!summary || !summary.isPaid) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <p className="text-sm font-semibold text-text-primary">Premium feature usage this month</p>
      <BillingBar label="Insider connection lookups" used={summary.insiderConnections.used} limit={summary.insiderConnections.limit} />
      <BillingBar label="Company research runs" used={summary.companyResearch.used} limit={summary.companyResearch.limit} />
    </div>
  );
}

function UsageBar({ row }: { row: UsageStatRow }) {
  // A null limit is genuinely unlimited (an admin, or a plan override of
  // null). There is no meaningful bar to fill against no cap, and dividing
  // by it would render either NaN or a full red bar for someone who is not
  // limited at all — so this shows the count alone.
  if (row.limit === null) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{row.label}</span>
        <span className="text-text-muted">{row.count} used · unlimited</span>
      </div>
    );
  }

  const pct = row.limit > 0 ? Math.min(100, Math.round((row.count / row.limit) * 100)) : 100;
  const isNearLimit = pct >= 80;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{row.label}</span>
        <span className={isNearLimit ? "font-medium text-warning" : "text-text-muted"}>
          {row.limit === 0 ? "not included in your plan" : `${row.count} / ${row.limit}`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
        <div
          className={`h-full rounded-full ${isNearLimit ? "bg-warning" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Settings -> Credits & usage (build-plan.md §H) — real data, replacing the
// static placeholder. Resets at midnight UTC, matching lib/usage.ts's own
// `day` key (today's date, server-computed the same way).
export function CreditsUsageTab() {
  const [rows, setRows] = useState<UsageStatRow[] | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUsageStats().then((result) => {
      if (result.success) {
        setRows(result.rows);
        setMultiplier(result.multiplier);
      } else {
        setError(result.error);
      }
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PremiumUsageSection />

      <div>
        <h3 className="text-base font-semibold text-text-primary">Credits &amp; usage</h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Today&apos;s AI usage against your free-plan daily limits. Resets at midnight UTC.
          {multiplier > 1 && ` Your limits are boosted ${Math.round((multiplier - 1) * 100)}% from referral rewards.`}
        </p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {rows === null ? (
        // Bar-shaped skeleton, not a small spinner — matches the final
        // UsageBar list's shape so the swap-in doesn't visibly jump the
        // container's height (same fix as SubscriptionTab's loading state).
        <div className="flex animate-pulse flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="h-3 w-32 rounded bg-surface-secondary" />
              <div className="h-1.5 w-full rounded-full bg-surface-secondary" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Ticket className="h-6 w-6 text-text-muted" />
          <p className="text-sm text-text-secondary">Nothing used yet today</p>
          <p className="max-w-xs text-xs text-text-muted">Your AI feature usage will show up here as you use them.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <UsageBar key={row.action} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
