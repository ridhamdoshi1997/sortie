"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

type DayCell = { date: string; count: number };

// GitHub-contribution-graph style — replaces the old day-of-week bar/area
// charts (build-plan.md §P: "an activity heatmap replacing the day-of-week
// line charts"). No new dependency — a plain CSS grid of colored divs, same
// minimal-dependency posture as the rest of this app. Intensity uses
// --color-info (steel blue), matching CompanyResearchChart's existing color
// choice for this exact kind of plain informational count data — not
// --color-agent (AI-content only) or --color-accent (primary actions/
// wordmark), neither of which this data represents.
//
// Visual-hierarchy pass (2026-08-18, agy research) — zero-count cells now
// recede almost entirely (a faint inset ring instead of a visible flat
// fill), and the top intensity tier gets a lighter inner ring so it reads
// as "lit" rather than just a flatter block of the same hue. The grid
// itself sits in `.dashboard-well` (globals.css) — a slightly darker,
// inset-shadowed container — so the colored cells look embedded rather
// than floating on the same flat card surface as everything else.
// Signal redesign: agent-teal tiers, not info-blue. These cells count
// AI-evaluated jobs, so teal is the semantically correct colour here —
// blue was off-palette entirely and read as a third accent alongside
// amber and teal.
function intensityClass(count: number, maxCount: number): string {
  if (count === 0) return "signal-heat-cell ring-1 ring-inset ring-border/40";
  const ratio = count / maxCount;
  if (ratio >= 0.75) return "signal-heat-cell signal-heat-3";
  if (ratio >= 0.5) return "signal-heat-cell signal-heat-2";
  return "signal-heat-cell signal-heat-1";
}

// Builds a fixed 12-week grid ending today, columns = weeks (oldest to
// newest), rows = Sun..Sat — the standard GitHub layout, so each column's
// top cell is always Sunday regardless of what day "today" falls on.
function buildWeeks(countsByDate: Record<string, number>): DayCell[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = 12 * 7;
  const start = new Date(today);
  start.setDate(start.getDate() - (totalDays - 1) - today.getDay());

  const weeks: DayCell[][] = [];
  const cursor = new Date(start);
  for (let week = 0; week < 12 + 1; week++) {
    const column: DayCell[] = [];
    for (let day = 0; day < 7; day++) {
      const iso = cursor.toISOString().slice(0, 10);
      column.push({ date: iso, count: countsByDate[iso] ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(column);
  }
  return weeks;
}

export function ActivityHeatmap({ countsByDate }: { countsByDate: Record<string, number> }) {
  const [hovered, setHovered] = useState<DayCell | null>(null);
  const weeks = buildWeeks(countsByDate);
  const maxCount = Math.max(1, ...Object.values(countsByDate));
  const totalCount = Object.values(countsByDate).reduce((sum, c) => sum + c, 0);

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="signal-icon-chip">
            <CalendarDays className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold leading-6 text-text-primary">Jobs Found — Last 12 Weeks</h2>
        </div>
        <p className="font-mono text-xs text-text-muted">
          {hovered ? `${hovered.count} on ${hovered.date}` : `${totalCount} total`}
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-text-muted">No jobs found yet — run a search to see activity here.</p>
        </div>
      ) : (
        // Cells size themselves off the card width (mockup's .heat-grid:
        // repeat(N, 1fr) + aspect-ratio 1) instead of the fixed 12px squares
        // this used before, which left the grid marooned in a fraction of the
        // card. Column-flow with 7 explicit rows keeps the same Sun..Sat-per-
        // column layout the date math builds. overflow-x-auto is gone with it
        // — the grid now fits by construction rather than scrolling.
        <div className="dashboard-well mt-5 p-3">
          <div
            className="grid gap-[4px]"
            style={{
              gridAutoFlow: "column",
              gridTemplateRows: "repeat(7, minmax(0, 1fr))",
              gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
            }}
          >
            {weeks.flatMap((week) =>
              week.map((cell) => (
                <div
                  key={cell.date}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  className={intensityClass(cell.count, maxCount)}
                  aria-label={`${cell.count} job${cell.count === 1 ? "" : "s"} found on ${cell.date}`}
                />
              )),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
