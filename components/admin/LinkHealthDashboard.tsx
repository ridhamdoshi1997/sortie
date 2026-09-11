"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Wrench } from "lucide-react";

import { reloadLinkHealth, triggerApplyLinkRepair } from "@/actions/adminLinkHealth";
import { LinkHealthReport } from "@/components/admin/LinkHealthReport";
import type { LinkHealthFullReport, LinkHealthSource } from "@/lib/admin/linkHealth";

// Phase 52, section 7. Three things the page was missing:
//
//   1. The crawl cache. It only ever scanned `jobs` — the small per-user
//      slice created by real searches — while `discovered_postings`, the
//      ~810k-row cache users actually search, went unmeasured.
//   2. A trend. It was a point-in-time count with nothing to compare to.
//   3. An action. An admin could see a bad number and do nothing about it
//      except wait up to an hour for the cron.
//
// The two sources are rendered as separate reports and never summed —
// blending them would let a healthy 800-row table hide a sick 800,000-row
// one.

const SOURCE_ORDER: LinkHealthSource[] = ["discovered_postings", "jobs"];

export function LinkHealthDashboard({ initial }: { initial: LinkHealthFullReport }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function recheck(): void {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await reloadLinkHealth();
      if (!result.success) {
        setError(result.error);
        return;
      }
      setData(result.data);
      setNotice("Re-checked. The cache figure draws a fresh random sample, so it will move slightly.");
    });
  }

  function repair(): void {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await triggerApplyLinkRepair();
      if (!result.success) {
        setError(result.error ?? "Could not queue a repair run.");
        return;
      }
      setNotice(
        "Repair queued. It runs in the background — these numbers will not move until it finishes, so re-check in a few minutes.",
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={recheck}
          disabled={isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          Re-check now
        </button>
        <button
          type="button"
          onClick={repair}
          disabled={isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <Wrench className="h-4 w-4" />
          Run repair pass
        </button>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}
      {notice && <p className="text-xs text-text-muted">{notice}</p>}

      <TrendPanel report={data} />

      {SOURCE_ORDER.map((source) => {
        const report = data.sources.find((s) => s.source === source);
        if (!report) return null;
        return (
          <section key={source} className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-text-primary">{report.label}</h2>
            <LinkHealthReport report={report} />
          </section>
        );
      })}
    </div>
  );
}

function TrendPanel({ report }: { report: LinkHealthFullReport }) {
  if (report.trendIsEmpty) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-text-primary">Trend</p>
        <p className="mt-1 text-xs text-text-muted">
          History starts today. Snapshots are written each time this page is checked, one per day per source — there is
          nothing to backfill from, because nothing was ever recorded before now.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-sm font-semibold text-text-primary">Trend — direct-link share</p>
      <p className="mt-1 text-xs text-text-muted">
        One snapshot per day per source. A day checked five times keeps one row, so a heavily-checked day does not
        outweigh a quiet one.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="bg-surface-secondary">
              {["Day", "Source", "Direct", "Mirror", "Sample"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.trend.map((t) => (
              <tr key={`${t.day}:${t.source}`} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-text-secondary">{t.day}</td>
                <td className="px-4 py-2 text-text-secondary">
                  {t.source === "jobs" ? "Search results" : "Crawl cache"}
                </td>
                <td className="px-4 py-2 font-mono text-text-primary">{t.directPct.toFixed(1)}%</td>
                <td className={`px-4 py-2 font-mono ${t.mirrorPct > 5 ? "text-error" : "text-text-secondary"}`}>
                  {t.mirrorPct.toFixed(1)}%
                </td>
                <td className="px-4 py-2 font-mono text-text-muted">{t.sampleSize.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
