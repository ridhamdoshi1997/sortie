export const dynamic = "force-dynamic";

import { Download } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { CareerTimeline } from "@/components/career/CareerTimeline";
import { OutcomeInsights } from "@/components/career/OutcomeInsights";
import { StarVault } from "@/components/career/StarVault";
import { BragDocGenerator } from "@/components/career/BragDocGenerator";
import { MarketReadiness } from "@/components/career/MarketReadiness";
import { SkillGapTracker } from "@/components/career/SkillGapTracker";
import { ResumeSuggestionsQueue } from "@/components/career/ResumeSuggestionsQueue";
import { WeeklyWinsTicker } from "@/components/career/WeeklyWinsTicker";
import {
  buildCareerEpochs,
  buildEducationEntries,
  buildFlatTimeline,
  buildJobOutcomeEntries,
  buildWeeklyWins,
  mostRecentActivityDate,
  type JobOutcomeRow,
} from "@/lib/careerTimeline";
import { listApplicationEvents, listInterviewEventsWithJob } from "@/actions/careerEvents";
import { getOutcomeStats } from "@/actions/outcomeInsights";
import { listStarStories } from "@/actions/starStories";
import { listPendingResumeSuggestions } from "@/actions/resumeSuggestions";
import type { AccomplishmentRow } from "@/actions/accomplishments";
import type { Profile } from "@/types";

// Soft nudge, not a fabricated notification system — plain text only,
// matching this app's established honesty-in-UI rule (see JobActionBar's
// posted_at/found_at gotcha for why this app never invents a false-fresh
// signal). 60 days chosen to match lib/jobStatus.ts's STALE_AFTER_DAYS
// precedent for "this has gone quiet" thresholds.
function freshnessNudge(mostRecent: string | null): string | null {
  if (!mostRecent) return null;
  const daysSince = Math.floor((Date.now() - new Date(mostRecent).getTime()) / (24 * 60 * 60 * 1000));
  if (daysSince < 60) return null;
  return "It's been a while since you added anything here — even a small win is worth logging.";
}

export default async function CareerPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const [
    { data: profile },
    { data: accomplishments },
    { data: jobOutcomes },
    applicationEventsResult,
    outcomeStatsResult,
    starStoriesResult,
    interviewEventsResult,
    resumeSuggestionsResult,
  ] = await Promise.all([
    insforge.database
      .from("profiles")
      .select("work_experience,education")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "work_experience" | "education">>(),
    insforge.database
      .from("accomplishments")
      .select("id,title,description,date,tags,related_job_id,source,created_at,updated_at")
      .eq("user_id", user.id)
      .order("date", { ascending: false }),
    insforge.database
      .from("jobs")
      .select("id,title,company,application_status,application_status_updated_at,found_at")
      .eq("user_id", user.id)
      .neq("application_status", "draft")
      .order("application_status_updated_at", { ascending: false }),
    listApplicationEvents(),
    getOutcomeStats(),
    listStarStories(),
    listInterviewEventsWithJob(),
    listPendingResumeSuggestions(),
  ]);

  const { epochs, unassigned } = buildCareerEpochs(profile, (accomplishments ?? []) as AccomplishmentRow[]);
  const education = buildEducationEntries(profile);
  const jobOutcomeEntries = buildJobOutcomeEntries((jobOutcomes ?? []) as JobOutcomeRow[]);
  const applicationEvents = applicationEventsResult.data ?? [];
  const flatTimeline = buildFlatTimeline(epochs, unassigned, education, applicationEvents, jobOutcomes ?? []);
  const nudge = freshnessNudge(mostRecentActivityDate(epochs, unassigned, jobOutcomeEntries));
  const weeklyWins = buildWeeklyWins((accomplishments ?? []) as AccomplishmentRow[]);

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              Career Record
            </h1>
            <p className="text-base text-text-secondary sm:text-lg">
              Your own career history — kept whether or not you&apos;re actively job hunting.
            </p>
          </div>
          <a
            href="/api/career/export"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <Download className="h-4 w-4" />
            Download your career record
          </a>
        </div>

        {nudge && (
          <div className="rounded-r-lg border-l-2 border-warning bg-warning/10 px-4 py-3">
            <p className="text-sm text-warning">{nudge}</p>
          </div>
        )}

        <WeeklyWinsTicker wins={weeklyWins} />

        <ResumeSuggestionsQueue initialSuggestions={resumeSuggestionsResult.data ?? []} />

        <OutcomeInsights
          stats={
            outcomeStatsResult.data ?? {
              hasEnoughData: false,
              byMatchBand: [],
              byGrade: [],
              skipReasons: [],
              appliedVsSkipped: { applied: 0, skipped: 0 },
              rejectionReasons: [],
            }
          }
        />

        <StarVault
          initialStories={starStoriesResult.data ?? []}
          interviewEvents={interviewEventsResult.data ?? []}
        />

        <BragDocGenerator />

        <MarketReadiness />

        <SkillGapTracker />

        <CareerTimeline
          epochs={epochs}
          unassigned={unassigned}
          education={education}
          jobOutcomes={jobOutcomeEntries}
          flatTimeline={flatTimeline}
        />
      </main>
    </>
  );
}
