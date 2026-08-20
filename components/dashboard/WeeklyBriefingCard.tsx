import { CalendarClock } from "lucide-react";

import { formatDate } from "@/lib/utils";

// Proactive weekly AI briefing (build-plan.md §H, "AI heavy dashboard" part
// 2) — pure display, zero AI cost on this render. The content was
// generated once by a weekly Inngest cron (lib/inngest/functions.ts's
// generateWeeklyBriefingsAsync) and stored on profiles.weekly_briefing;
// this just reads it. Honest about staleness — always shows the real
// generated_at date, never implies it's live.
export function WeeklyBriefingCard({
  briefing,
  generatedAt,
}: {
  briefing: string | null;
  generatedAt: string | null;
}) {
  if (!briefing) return null;

  return (
    <div className="rounded-r-lg border-l-2 border-agent bg-agent-light px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
          Your Weekly Briefing
        </p>
        {generatedAt && (
          <span className="flex items-center gap-1 font-mono text-[10px] text-agent-dark/70">
            <CalendarClock className="h-3 w-3" />
            {formatDate(generatedAt)}
          </span>
        )}
      </div>
      <p className="text-sm leading-6 text-agent-dark">{briefing}</p>
    </div>
  );
}
