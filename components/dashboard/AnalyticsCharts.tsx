"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChartColumn } from "lucide-react";

type MatchBucket = { range: string; count: number };

const AXIS_STYLE = { fill: "#9CA3AF", fontSize: 12 };

function isEmpty(data: { count: number }[]) {
  return data.every((d) => d.count === 0);
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  );
}

// CompanyResearchChart/JobsOverTimeChart (day-of-week bar/area charts)
// retired 2026-08-18 — replaced by ActivityHeatmap.tsx's 12-week
// GitHub-style grid per the dashboard redesign (build-plan.md §P).

export function MatchDistributionChart({ data }: { data: MatchBucket[] }) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center gap-3">
        <span className="icon-chip-neutral">
          <ChartColumn className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold leading-6 text-text-primary">
          Match Score Distribution
        </h2>
      </div>
      <div className="mt-6 h-55">
        {isEmpty(data) ? (
          <EmptyState message="No scored matches yet." />
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--color-border)"
              strokeDasharray="4 4"
            />
            <XAxis
              dataKey="range"
              axisLine={false}
              tickLine={false}
              tick={AXIS_STYLE}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={AXIS_STYLE}
              tickCount={5}
            />
            <Tooltip
              cursor={{ fill: "var(--color-surface-secondary)" }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                fontSize: 12,
              }}
            />
            {/* Signal redesign: agent-teal, not success-green. This chart
                plots AI-assigned match scores, so it follows the Agent
                colour like every other AI output — green implied a
                good/bad judgement the data doesn't make. */}
            <Bar
              dataKey="count"
              fill="var(--color-agent)"
              radius={[4, 4, 0, 0]}
              maxBarSize={60}
            />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
