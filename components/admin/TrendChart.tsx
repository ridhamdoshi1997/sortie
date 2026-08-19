"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { DailyCount } from "@/lib/admin/queries";

const AXIS_STYLE = { fill: "var(--color-text-muted)", fontSize: 12 };

function formatDayLabel(iso: React.ReactNode): string {
  if (typeof iso !== "string") return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isEmpty(data: DailyCount[]): boolean {
  return data.every((d) => d.count === 0);
}

// Same recharts + design-token conventions as
// components/dashboard/AnalyticsCharts.tsx's MatchDistributionChart — a
// line chart is the right shape here (trend-over-time data, per
// ui-ux-pro-max's chart-selection guidance), not a new bar variant.
export function TrendChart({ title, data, colorVar }: { title: string; data: DailyCount[]; colorVar: string }) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <h2 className="text-base font-semibold leading-6 text-text-primary">{title}</h2>
      <div className="mt-6 h-55">
        {isEmpty(data) ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">No data in this window yet.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="4 4" />
              <XAxis dataKey="date" tickFormatter={formatDayLabel} axisLine={false} tickLine={false} tick={AXIS_STYLE} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={AXIS_STYLE} tickCount={5} />
              <Tooltip
                labelFormatter={formatDayLabel}
                cursor={{ stroke: "var(--color-border)" }}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12 }}
              />
              <Line type="monotone" dataKey="count" stroke={colorVar} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
