"use client";

import { useState } from "react";

type DayCell = { date: string; count: number };

// GitHub-contribution-graph style — replaces the old day-of-week bar/area
// charts (build-plan.md §P: "an activity heatmap replacing the day-of-week
// line charts"). No new dependency — a plain CSS grid of colored divs, same
// minimal-dependency posture as the rest of this app. Intensity uses
// --color-info (steel blue), matching CompanyResearchChart's existing color
// choice for this exact kind of plain informational count data — not
// --color-agent (AI-content only) or --color-accent (primary actions/
// wordmark), neither of which this data represents.
function intensityClass(count: number, maxCount: number): string {
  if (count === 0) return "bg-surface-secondary";
  const ratio = count / maxCount;
  if (ratio >= 0.75) return "bg-info";
  if (ratio >= 0.5) return "bg-info/70";
  if (ratio >= 0.25) return "bg-info/45";
  return "bg-info/25";
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
        <h2 className="text-base font-semibold leading-6 text-text-primary">Jobs Found — Last 12 Weeks</h2>
        <p className="font-mono text-xs text-text-muted">
          {hovered ? `${hovered.count} on ${hovered.date}` : `${totalCount} total`}
        </p>
      </div>

      {totalCount === 0 ? (
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-text-muted">No jobs found yet — run a search to see activity here.</p>
        </div>
      ) : (
        <div className="mt-5 flex gap-[3px] overflow-x-auto pb-1">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {week.map((cell) => (
                <div
                  key={cell.date}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  className={`h-3 w-3 rounded-[2px] transition-transform hover:scale-125 ${intensityClass(cell.count, maxCount)}`}
                  aria-label={`${cell.count} job${cell.count === 1 ? "" : "s"} found on ${cell.date}`}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
