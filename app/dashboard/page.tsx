import { PostHogIdentify } from "@/components/analytics/PostHogIdentify";
import { AIActionCenter } from "@/components/dashboard/AIActionCenter";
import { PipelineFunnel } from "@/components/dashboard/PipelineFunnel";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { UpcomingInterviews } from "@/components/dashboard/UpcomingInterviews";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { RejectionRadar } from "@/components/dashboard/RejectionRadar";
import { PipelineStrategyCard } from "@/components/dashboard/PipelineStrategyCard";
import { WeeklyBriefingCard } from "@/components/dashboard/WeeklyBriefingCard";
import { MatchDistributionChart } from "@/components/dashboard/AnalyticsCharts";
import { ProfileAttentionBanner } from "@/components/profile/ProfileAttentionBanner";
import { WelcomeTour } from "@/components/dashboard/WelcomeTour";
import { CustomizeDashboardModal } from "@/components/dashboard/CustomizeDashboardModal";
import { Navbar } from "@/components/layout/Navbar";
import type { DashboardWidgetKey } from "@/lib/dashboardWidgets";
import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { calculateCompletion } from "@/lib/profile-utils";
import { formatDate } from "@/lib/utils";
import { computeDashboardInsights } from "@/lib/dashboardInsights";
import { getListingSignal } from "@/lib/jobStatus";
import { STAGE_ORDER, type ApplicationStatus } from "@/lib/applicationStatus";
import type { Job, Profile } from "@/types";

type AgentRunRow = {
  id: string;
  job_title_searched: string | null;
  jobs_found: number | null;
  completed_at: string | null;
};

type ResearchedJobRow = {
  id: string;
  company: string;
  found_at: string;
};

const MATCH_BUCKETS = ["50-60%", "60-70%", "70-80%", "80-90%", "90-100%"] as const;

// Redesigned 2026-08-18 (build-plan.md §P, "command center" bento-grid) —
// replaces the old flat 4-stat-tile + 2x2-chart layout ("rearview mirror":
// what happened) with an Action Center + Pipeline Funnel hero row
// ("cockpit": what needs attention next) and click-through widgets. Full
// research/layout spec in build-plan.md §P; this is the real v1 slice of
// it — the "no dead ends" rule is honored for the Pipeline Funnel (links
// into a matching pre-filtered Missions list) and Upcoming Interviews/
// Rejection Radar (link straight to the job), not for every interaction the
// original research described (e.g. inline hover-popups of the 10-dimension
// breakdown) — real navigation covers the same underlying need without a
// second, parallel drill-down UI to build and maintain.
export default async function DashboardPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const [{ data: profile }, { data: jobRows }, { data: agentRuns }, { data: researchedJobs }] =
    await Promise.all([
      insforge.database
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle<Profile>(),
      insforge.database
        .from("jobs")
        .select("*")
        .eq("user_id", user.id)
        .returns<Job[]>(),
      insforge.database
        .from("agent_runs")
        .select("id, job_title_searched, jobs_found, completed_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(10)
        .returns<AgentRunRow[]>(),
      insforge.database
        .from("jobs")
        .select("id, company, found_at")
        .eq("user_id", user.id)
        .not("company_research", "is", null)
        .order("found_at", { ascending: false })
        .limit(10)
        .returns<ResearchedJobRow[]>(),
    ]);

  const jobs = jobRows ?? [];

  // Recent activity — merge agent_runs + researched jobs, sort by time, take top 10
  type ActivityItem = {
    id: string;
    text: string;
    time: string;
    type: "job_found" | "researched";
    sortKey: number;
  };

  const runItems: ActivityItem[] = (agentRuns ?? [])
    .filter((r) => r.completed_at)
    .map((r) => ({
      id: `run-${r.id}`,
      text: `Found ${r.jobs_found ?? 0} jobs for ${r.job_title_searched ?? "your search"}`,
      time: formatDate(r.completed_at!),
      type: "job_found" as const,
      sortKey: new Date(r.completed_at!).getTime(),
    }));

  const researchItems: ActivityItem[] = (researchedJobs ?? []).map((j) => ({
    id: `research-${j.id}`,
    text: `Researched ${j.company.trim()}`,
    time: formatDate(j.found_at),
    type: "researched" as const,
    sortKey: new Date(j.found_at).getTime(),
  }));

  const activityItems = [...runItems, ...researchItems]
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, 10)
    .map(({ id, text, time, type }) => ({ id, text, time, type }));

  // Jobs-found-per-day heatmap data (last 12 weeks)
  const jobsByDate: Record<string, number> = {};
  for (const j of jobs) {
    if (!j.found_at) continue;
    const iso = new Date(j.found_at).toISOString().slice(0, 10);
    jobsByDate[iso] = (jobsByDate[iso] ?? 0) + 1;
  }

  // Match score distribution (all time, scores >= 50) — unchanged from the
  // pre-redesign dashboard, MatchDistributionChart is still a real widget.
  const matchCounts: Record<string, number> = {};
  for (const j of jobs) {
    const score = j.match_score ?? 0;
    if (score < 50) continue;
    const bucket =
      score >= 90
        ? "90-100%"
        : score >= 80
          ? "80-90%"
          : score >= 70
            ? "70-80%"
            : score >= 60
              ? "60-70%"
              : "50-60%";
    matchCounts[bucket] = (matchCounts[bucket] ?? 0) + 1;
  }
  const matchDistributionData = MATCH_BUCKETS.map((r) => ({ range: r, count: matchCounts[r] ?? 0 }));

  // Pipeline Funnel counts — excludes jobs the Action Center itself already
  // flags as likely gone (lib/dashboardInsights.ts's own "needs-attention"
  // signal), same real bug fix as lib/pipelineStrategy.ts's snapshot: a
  // stale/dropped listing sitting in Draft isn't real pipeline backlog, and
  // counting it that way is what made the funnel (and the AI Pipeline
  // Strategy Read built on identical logic) look like a bottleneck that
  // wasn't real.
  const funnelCounts = Object.fromEntries(
    STAGE_ORDER.map((stage) => [
      stage,
      jobs.filter((j) => {
        if (j.application_status !== stage || j.is_hidden) return false;
        const signal = getListingSignal(j);
        return signal?.level !== "confirmed" && signal?.level !== "likely";
      }).length,
    ]),
  ) as Record<ApplicationStatus, number>;

  const interviewingJobs = jobs
    .filter((j) => j.application_status === "interviewing" && !j.is_hidden)
    .map((j) => ({ id: j.id, title: j.title, company: j.company, company_logo_url: j.company_logo_url }));

  const rejectedJobs = jobs
    .filter((j) => j.application_status === "rejected")
    .map((j) => ({ id: j.id, title: j.title, company: j.company, rejection_diagnosis: j.rejection_diagnosis }));

  // Profile completion
  const { completionPercent, missingFields } = calculateCompletion(
    profile ?? {
      full_name: null,
      phone: null,
      location: null,
      current_title: null,
      experience_level: null,
      years_experience: null,
      skills: [],
      work_experience: null,
      education: [],
    },
  );

  const insights = computeDashboardInsights(jobs, completionPercent);

  const hidden = new Set<DashboardWidgetKey>(
    (profile?.dashboard_hidden_widgets ?? []) as DashboardWidgetKey[],
  );
  const showUpcomingInterviews = interviewingJobs.length > 0 && !hidden.has("upcomingInterviews");

  // Row 1/2 keep their exact hand-tuned bento spans (build-plan.md §P) when
  // every widget in them is visible — the common case, zero visual change
  // from before this feature existed. Only once the user has actually hidden
  // something in a row does it fall back to a simple equal-width, auto-
  // wrapping grid (CSS `auto-fit`, no Tailwind breakpoint juggling needed) —
  // never a hand-maintained case for every possible combination of hidden
  // widgets, and never dead whitespace where a hidden widget used to be.
  const row1Items = [
    { key: "aiActionCenter" as const, node: <AIActionCenter insights={insights} /> },
    { key: "pipelineFunnel" as const, node: <PipelineFunnel counts={funnelCounts} /> },
  ].filter((item) => !hidden.has(item.key));

  const row2Items = [
    { key: "matchDistribution" as const, node: <MatchDistributionChart data={matchDistributionData} /> },
    { key: "activityHeatmap" as const, node: <ActivityHeatmap countsByDate={jobsByDate} /> },
    ...(showUpcomingInterviews
      ? [{ key: "upcomingInterviews" as const, node: <UpcomingInterviews jobs={interviewingJobs} /> }]
      : []),
  ].filter((item) => !hidden.has(item.key));

  const row3Items = [
    { key: "recentActivity" as const, node: <RecentActivity items={activityItems} /> },
    { key: "rejectionRadar" as const, node: <RejectionRadar jobs={rejectedJobs} /> },
  ].filter((item) => !hidden.has(item.key));

  return (
    <>
      <PostHogIdentify userId={user.id} />
      <Navbar isAuthenticated />
      <WelcomeTour />
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-360 flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <CustomizeDashboardModal initialHidden={Array.from(hidden)} />

        {completionPercent < 100 && (
          <ProfileAttentionBanner
            completionPercent={completionPercent}
            missingFields={missingFields}
          />
        )}

        {!hidden.has("weeklyBriefing") && (
          <WeeklyBriefingCard briefing={profile?.weekly_briefing ?? null} generatedAt={profile?.weekly_briefing_generated_at ?? null} />
        )}

        {/* Row 1 — hero: what needs attention next, not what already happened */}
        {row1Items.length === 2 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="lg:col-span-3">{row1Items[0].node}</div>
            {row1Items[1].node}
          </div>
        ) : row1Items.length === 1 ? (
          row1Items[0].node
        ) : null}

        {!hidden.has("pipelineStrategy") && <PipelineStrategyCard />}

        {/* Row 2 — match quality, activity trend, and (only if real) upcoming interviews.
           The two branches below are the only combinations this row's bespoke
           1/2/1-span layout was ever designed for (with vs. without a real
           interviewing-stage job) — anything else only happens because the
           user explicitly hid a widget, which falls to the generic reflow. */}
        {row2Items.length === 0 ? null : row2Items.map((i) => i.key).join(",") ===
          ["matchDistribution", "activityHeatmap", "upcomingInterviews"].join(",") ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            {row2Items[0].node}
            <div className="lg:col-span-2">{row2Items[1].node}</div>
            {row2Items[2].node}
          </div>
        ) : row2Items.map((i) => i.key).join(",") === ["matchDistribution", "activityHeatmap"].join(",") ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {row2Items[0].node}
            <div className="lg:col-span-2">{row2Items[1].node}</div>
          </div>
        ) : row2Items.length === 1 ? (
          row2Items[0].node
        ) : (
          <div className="grid grid-cols-1 gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {row2Items.map((item) => (
              <div key={item.key}>{item.node}</div>
            ))}
          </div>
        )}

        {/* Row 3 — recent activity + rejection intelligence, both real reuse of existing data */}
        {row3Items.length === 2 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {row3Items[0].node}
            {row3Items[1].node}
          </div>
        ) : row3Items.length === 1 ? (
          row3Items[0].node
        ) : null}
      </main>
    </>
  );
}
