"use client";

import { useEffect, useState } from "react";

import { getUsageStats, type UsageStatsData } from "@/actions/usageStats";
import { syncTimezone } from "@/actions/timezone";

// One line of usage. Plan management and upgrades live in Settings' own
// "Subscription" tab (components/settings/SubscriptionTab.tsx); this tab stays
// scoped to "how much have I used".
function UsageLine({
  label,
  count,
  limit,
  trackedOnly = false,
  period,
}: {
  label: string;
  count: number;
  limit: number | null;
  trackedOnly?: boolean;
  period: "day" | "month";
}) {
  // Unused actions stay listed but recede, so the lines that matter today
  // are the ones that read first.
  const labelClass = count === 0 ? "text-text-muted" : "text-text-secondary";
  const periodWord = period === "day" ? "today" : "this month";

  // No bar without a finite cap. Dividing by an unlimited allowance renders
  // NaN or a full warning bar for someone who is not limited at all.
  if (limit === null || trackedOnly) {
    return (
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className={labelClass}>{label}</span>
        <span className="shrink-0 font-mono text-text-muted">
          {count} {periodWord} · {trackedOnly ? "counted, not limited" : "unlimited"}
        </span>
      </div>
    );
  }

  if (limit === 0) {
    return (
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="shrink-0 text-text-muted">not included in your plan</span>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((count / limit) * 100));
  const isNearLimit = pct >= 80;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-4 text-xs">
        <span className={labelClass}>{label}</span>
        <span className={`shrink-0 font-mono ${isNearLimit ? "font-medium text-warning" : "text-text-muted"}`}>
          {count} / {limit}
          {period === "month" ? "/mo" : ""}
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

// Settings -> Credits & usage (build-plan.md §H). Every AI action the app
// meters, grouped, for everyone — admins included, since uncapped is not the
// same as uncounted. Daily limits reset at the user's own midnight.
export function CreditsUsageTab() {
  const [data, setData] = useState<UsageStatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Report this browser's timezone before reading, so "today" below is the
      // user's own day even on the very first visit after this shipped. The
      // Navbar also syncs, but it may not have finished by the time this runs.
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timezone) await syncTimezone(timezone);
      } catch {
        // The stats still load, in whatever zone is already stored.
      }
      const result = await getUsageStats();
      if (cancelled) return;
      if (result.success) {
        setData(result);
      } else {
        setError(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const usedToday = data ? data.rows.reduce((sum, row) => sum + row.count, 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-text-primary">Credits &amp; usage</h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          {data === null
            ? "Every AI action counted on your account."
            : data.isAdmin
              ? "Admin accounts have no limits, but every AI action is still counted here."
              : `Today's AI usage against your ${data.planName} plan's limits.`}
          {data && ` Daily limits reset at midnight in your timezone (${data.timezone.replace(/_/g, " ")}).`}
          {data && data.multiplier > 1 && ` Your limits are boosted ${Math.round((data.multiplier - 1) * 100)}% from referral rewards.`}
        </p>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {data === null ? (
        !error && (
          // Bar-shaped skeleton, not a spinner — matches the final list's
          // shape so the swap-in doesn't jump the container's height.
          <div className="flex animate-pulse flex-col gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="h-3 w-32 rounded bg-surface-secondary" />
                <div className="h-1.5 w-full rounded-full bg-surface-secondary" />
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
            <div>
              <p className="text-sm font-semibold text-text-primary">This month</p>
              <p className="mt-0.5 text-xs text-text-muted">Paid lookups, counted against your billing period.</p>
            </div>
            {data.monthly.map((row) => (
              <UsageLine key={row.feature} label={row.label} count={row.used} limit={row.limit} period="month" />
            ))}
          </section>

          <section className="flex flex-col gap-5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-semibold text-text-primary">Today</p>
              <p className="font-mono text-xs text-text-muted">
                {usedToday} AI action{usedToday === 1 ? "" : "s"}
              </p>
            </div>

            {data.groups.map((group) => (
              <div key={group.key} className="flex flex-col gap-3">
                <p className="text-xs font-medium text-text-muted">{group.label}</p>
                {data.rows
                  .filter((row) => row.group === group.key)
                  .map((row) => (
                    <UsageLine
                      key={row.action}
                      label={row.label}
                      count={row.count}
                      limit={row.limit}
                      trackedOnly={row.trackedOnly}
                      period="day"
                    />
                  ))}
              </div>
            ))}

            <p className="text-xs leading-5 text-text-muted">
              &ldquo;Counted, not limited&rdquo; is AI work that runs as part of something you already did — like
              scoring the jobs a search returns — so it never uses up an allowance of its own.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
