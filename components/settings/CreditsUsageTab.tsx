"use client";

import { useEffect, useState } from "react";
import { Loader2, Ticket } from "lucide-react";

import { getUsageStats, type UsageStatRow } from "@/actions/usageStats";

function UsageBar({ row }: { row: UsageStatRow }) {
  const pct = Math.min(100, Math.round((row.count / row.limit) * 100));
  const isNearLimit = pct >= 80;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{row.label}</span>
        <span className={isNearLimit ? "font-medium text-warning" : "text-text-muted"}>
          {row.count} / {row.limit}
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
      <div>
        <h3 className="text-base font-semibold text-text-primary">Credits &amp; usage</h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Today&apos;s AI usage against your free-plan daily limits. Resets at midnight UTC.
          {multiplier > 1 && ` Your limits are boosted ${Math.round((multiplier - 1) * 100)}% from referral rewards.`}
        </p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {rows === null ? (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading your usage…
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
