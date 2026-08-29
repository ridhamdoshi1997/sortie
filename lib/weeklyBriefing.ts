import { z } from "zod";

import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";

// Proactive weekly AI briefing (build-plan.md §H, "AI heavy dashboard" part
// 2). Deliberately NOT a live-per-visit AI call — this is generated once a
// week by an Inngest cron (lib/inngest/functions.ts's generateWeeklyBriefings
// AsyncFn) and stored on profiles.weekly_briefing, same "aggregate real data
// for free, one synthesis call" shape as every other AI widget in this app,
// just moved to a scheduled batch instead of a per-user button click — the
// whole point is it should feel automatic/proactive without costing a live
// call on every dashboard load.

export type WeeklyActivitySnapshot = {
  jobsFoundThisWeek: number;
  applicationsThisWeek: number;
  interviewsThisWeek: number;
  offersThisWeek: number;
  upcomingDeadlines: { label: string; daysAway: number }[];
};

// A user with zero real activity this week and no upcoming deadlines gets
// no briefing generated at all (see the cron's own eligibility filter) —
// this constant is the pure-function-level guard for direct callers/tests.
export function hasAnyWeeklyActivity(snapshot: WeeklyActivitySnapshot): boolean {
  return (
    snapshot.jobsFoundThisWeek > 0 ||
    snapshot.applicationsThisWeek > 0 ||
    snapshot.interviewsThisWeek > 0 ||
    snapshot.offersThisWeek > 0 ||
    snapshot.upcomingDeadlines.length > 0
  );
}

export type WeeklyBriefingResult = {
  summary: string; // 2-3 sentences, grounded only in the supplied real snapshot
};

const resultSchema = z.object({
  summary: z.string().min(1),
});

function fallbackResult(): WeeklyBriefingResult {
  return { summary: "Automated weekly summary failed to generate this week — check back next week." };
}

const SYSTEM_PROMPT = `You are writing a short, real weekly summary for a job seeker's dashboard, based ONLY on their own real activity counts from the last 7 days.

Rules:
- 2-3 sentences only, in second person ("You found...", "You have..."), grounded ONLY in the specific numbers given — never invent a percentage, a market trend, or anything not in the data.
- If the week was quiet (all zeros, no deadlines), say that plainly and encouragingly, don't invent activity.
- If there's an upcoming deadline, mention it — that's the single most actionable thing a weekly summary can surface.
- Never use generic encouragement without a real number backing it up.

Return ONLY valid JSON: { "summary": "string" }`;

export async function generateWeeklyBriefing(
  snapshot: WeeklyActivitySnapshot,
  provider: ModelProvider = "gemini",
  tier: ModelTier = "smart",
): Promise<WeeklyBriefingResult> {
  const deadlineLines =
    snapshot.upcomingDeadlines.length > 0
      ? snapshot.upcomingDeadlines
          .map((d) => `- ${d.label} in ${d.daysAway} day${d.daysAway === 1 ? "" : "s"}`)
          .join("\n")
      : "None";

  const userPrompt = `This user's real activity over the last 7 days:
- Jobs found: ${snapshot.jobsFoundThisWeek}
- Applications submitted: ${snapshot.applicationsThisWeek}
- Interviews logged: ${snapshot.interviewsThisWeek}
- Offers received: ${snapshot.offersThisWeek}

Upcoming deadlines (next 7 days):
${deadlineLines}`;

  const raw = await complete(await getModel(provider, tier), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    maxTokens: 400,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/weeklyBriefing] JSON parse failed", error);
    return fallbackResult();
  }

  const result = resultSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/weeklyBriefing] schema validation failed", result.error);
    return fallbackResult();
  }

  return result.data;
}
