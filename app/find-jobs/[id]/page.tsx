export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { after } from "next/server";

import { PostHogIdentify } from "@/components/analytics/PostHogIdentify";
import { ApplicationHistory } from "@/components/job-details/ApplicationHistory";
import { Benefits } from "@/components/job-details/Benefits";
import { CompanyResearch } from "@/components/job-details/CompanyResearch";
import { DocumentGenerator } from "@/components/job-details/DocumentGenerator";
import { EmailDrafts } from "@/components/job-details/EmailDrafts";
import { EvaluationBreakdown } from "@/components/job-details/EvaluationBreakdown";
import { FloatingApplyButton } from "@/components/job-details/FloatingApplyButton";
import { HiringProcess } from "@/components/job-details/HiringProcess";
import { InsiderConnections } from "@/components/job-details/InsiderConnections";
import { LeverageSynthesizer } from "@/components/job-details/LeverageSynthesizer";
import { NegotiationScript } from "@/components/job-details/NegotiationScript";
import { NinetyDayPlan } from "@/components/job-details/NinetyDayPlan";
import { OfferWorkspace } from "@/components/job-details/OfferWorkspace";
import { StrategicMoatBriefing } from "@/components/job-details/StrategicMoatBriefing";
import { InterviewDebrief } from "@/components/job-details/InterviewDebrief";
import { InterviewPanel } from "@/components/job-details/InterviewPanel";
import { TrapDoorPredictor } from "@/components/job-details/TrapDoorPredictor";
import { InterrogationPlan } from "@/components/job-details/InterrogationPlan";
import { listInterviewPanel } from "@/actions/interviewPanel";
import { listJobEventHistory } from "@/actions/careerEvents";
import { QuestionBankPanel } from "@/components/interview/QuestionBankPanel";
import { ApplyVerdictBadge } from "@/components/job-details/ApplyVerdict";
import { JobActionBar } from "@/components/job-details/JobActionBar";
import { AddToCompareButton } from "@/components/job-details/AddToCompareButton";
import { FollowUpNudge } from "@/components/job-details/FollowUpNudge";
import { JobDeadline } from "@/components/job-details/JobDeadline";
import { JobDescription } from "@/components/job-details/JobDescription";
import { JobInfo } from "@/components/job-details/JobInfo";
import { JobTagsAndNotes } from "@/components/job-details/JobTagsAndNotes";
import { WhyILeftReflection } from "@/components/job-details/WhyILeftReflection";
import { MatchScore } from "@/components/job-details/MatchScore";
import { Qualification } from "@/components/job-details/Qualification";
import { Responsibilities } from "@/components/job-details/Responsibilities";
import { ResumeFitSection } from "@/components/job-details/ResumeFitSection";
import { Navbar } from "@/components/layout/Navbar";
import { NetworkSignals } from "@/components/shared/NetworkSignals";
import { OutreachSignal } from "@/components/job-details/OutreachSignal";
import { Tabs } from "@/components/ui/Tabs";
import { isAdminUser, resolveProvider } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { buildNetworkSearchTerms, findPreviousEmployerMatch } from "@/lib/networkSignals";
import { getCompanyHiringSignal } from "@/lib/hiringSignal";
import { computeReappearanceCounts, getReappearanceSignal } from "@/lib/churnSignal";
import { computeApplyVerdict } from "@/lib/applyVerdict";
import { normalizeRoleFamily } from "@/lib/interviewQuestions";
import type { Profile } from "@/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function JobDetailsPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  const insforge = await createInsforgeServer();
    const { data: job, error } = await insforge.database
        .from("jobs")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) console.error("DB Error:", error);

    if (!job) {
        notFound();
    }

  // Recently Viewed jobs (find-jobs page widget) — fire-and-forget via
  // after() so this write never adds latency to the page response. Reuses
  // the `insforge` client already constructed above (during render) rather
  // than calling createInsforgeServer() again inside the callback — that
  // would call cookies() internally, and Server Component after() callbacks
  // can't call request-time APIs themselves (Next.js docs).
  after(async () => {
    const { error: viewError } = await insforge.database
      .from("jobs")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("user_id", user.id);
    if (viewError) console.error("[find-jobs/[id]] last_viewed_at update", viewError);
  });

  const company = job.company ?? "this company";
  // external_apply_url/source_url are the originally-designed columns but
  // the scraper (lib/actions/scraper.actions.ts) has only ever written to
  // a separate `url` column — fall back to it so existing saved jobs (all
  // of them, currently) resolve a real apply link instead of showing none.
  const applyUrl = job.external_apply_url ?? job.source_url ?? job.url;
  // No structured work-mode field exists in the source data (confirmed live
  // against a real SerpApi response — only sometimes embedded in free-text
  // titles/locations like "(Hybrid)"), so this is a best-effort text match,
  // not a claim of precision we don't have.
  const isRemote = /\bremote\b/i.test(`${job.title ?? ""} ${job.location ?? ""}`);

  const { data: application } = await insforge.database
    .from("applications")
    .select("resume_pdf_url,cover_letter_pdf_url")
    .eq("user_id", user.id)
    .eq("job_id", job.id)
    .maybeSingle<{ resume_pdf_url: string | null; cover_letter_pdf_url: string | null }>();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("preferred_model,preferred_resume_theme,work_experience,education")
    .eq("id", user.id)
    .maybeSingle<
      Pick<
        Profile,
        "preferred_model" | "preferred_resume_theme" | "work_experience" | "education"
      >
    >();

  const previousEmployer = findPreviousEmployerMatch(
    job.company,
    profile?.work_experience ?? null,
  );
  const networkSearchTerms = buildNetworkSearchTerms(
    profile?.work_experience ?? null,
    profile?.education ?? null,
  );

  const hiringSignal = await getCompanyHiringSignal(job.company);

  const { data: allJobsForSignal } = await insforge.database
    .from("jobs")
    .select("company,title,found_at")
    .eq("user_id", user.id);
  const reappearanceSignal = getReappearanceSignal(job, computeReappearanceCounts(allJobsForSignal ?? []));

  const panelResult = job.application_status === "interviewing" ? await listInterviewPanel(job.id) : null;
  const interviewPanelMembers = panelResult?.data ?? [];

  const eventHistoryResult = await listJobEventHistory(job.id);
  const eventHistory = eventHistoryResult.data ?? [];

  const isAdmin = isAdminUser(user.email);
  // Clamp a stale non-Gemini preference (e.g. set before this policy existed,
  // or an admin allowlist change) so the selector never shows/persists a
  // provider a non-admin can no longer actually use.
  const modelValue = resolveProvider(profile?.preferred_model, user.email);

  const isInterviewing = job.application_status === "interviewing";

  // §Q2 — a lightweight count, not the full evaluator lookup (that happens
  // server-side inside the evaluation call itself) — just enough to decide
  // whether Qualification's "Sortie remembered..." line renders at all.
  const roleFamily = normalizeRoleFamily(job.title ?? "");
  const { count: correctionsAppliedCount } = await insforge.database
    .from("skill_corrections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("role_family", roleFamily);

  const applyVerdict = computeApplyVerdict(job);

  return (
    <>
      <PostHogIdentify userId={user.id} />
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full min-w-0 min-h-[calc(100vh-5rem)] max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Staggered entrance (2026-07-28) — .fade-in-up already existed
            (used on a few page titles) but was never applied to job-details
            cards. Wrapping divs here, not editing each card component, so
            this stays a page-level concern rather than 10+ files each
            growing a delay prop. Respects prefers-reduced-motion via the
            class itself. */}
        <div className="fade-in-up">
          <ApplyVerdictBadge verdict={applyVerdict} />
        </div>
        <div className="fade-in-up" style={{ animationDelay: "20ms" }}>
          <JobActionBar
            jobId={job.id}
            applyUrl={applyUrl}
            company={company}
            initialSaved={job.is_saved}
            initialHidden={job.is_hidden}
            initialApplicationStatus={job.application_status}
            foundAt={job.found_at}
            isRemote={isRemote}
            initialMarkedUnavailableAt={job.marked_unavailable_at}
            droppedFromSearchAt={job.dropped_from_search_at}
            reappearanceSignal={reappearanceSignal}
          />
        </div>
        <div className="fade-in-up" style={{ animationDelay: "40ms" }}>
          <AddToCompareButton jobId={job.id} title={job.title ?? "Untitled role"} company={company} />
        </div>
        <div className="fade-in-up" style={{ animationDelay: "50ms" }}>
          <FollowUpNudge applicationStatus={job.application_status} statusUpdatedAt={job.application_status_updated_at} />
        </div>
        <div className="fade-in-up" style={{ animationDelay: "60ms" }}>
          <JobInfo job={job} />
        </div>

        {eventHistory.length > 0 && (
          <div className="fade-in-up" style={{ animationDelay: "90ms" }}>
            <ApplicationHistory history={eventHistory} />
          </div>
        )}

        <div className="fade-in-up" style={{ animationDelay: "100ms" }}>
          <JobTagsAndNotes jobId={job.id} initialTags={job.tags ?? []} initialNotes={job.personal_notes} />
        </div>

        {job.application_status === "rejected" && (
          <div className="fade-in-up" style={{ animationDelay: "105ms" }}>
            <WhyILeftReflection jobId={job.id} initialLoved={job.reflection_loved} initialAvoid={job.reflection_avoid} />
          </div>
        )}

        <div className="fade-in-up" style={{ animationDelay: "110ms" }}>
          <JobDeadline jobId={job.id} initialDeadlineAt={job.next_deadline_at} initialLabel={job.next_deadline_label} />
        </div>

        <div className="fade-in-up" style={{ animationDelay: "120ms" }}>
          <Tabs
            defaultTabId={isInterviewing ? "interview-prep" : undefined}
            tabs={[
              {
                id: "overview",
                label: "Overview",
                content: (
                  <div className="flex flex-col gap-6">
                    <MatchScore
                      matchReason={job.match_reason}
                      evaluation={job.evaluation}
                      recommendationScore={job.recommendation_score}
                      titleScopeMismatch={job.title_scope_mismatch}
                    />

                    <EvaluationBreakdown
                      evaluation={job.evaluation ?? []}
                      recommendationScore={job.recommendation_score}
                      overallGrade={job.overall_grade}
                    />

                    <JobDescription
                      aboutRole={job.about_role || job.description}
                      sourceUrl={applyUrl}
                    />

                    <Responsibilities items={job.responsibilities ?? []} />

                    <Qualification
                      jobId={job.id}
                      matchedSkills={job.matched_skills}
                      missingSkills={job.missing_skills}
                      requirements={job.requirements}
                      niceToHave={job.nice_to_have}
                      jdDecoder={job.jd_decoder}
                      correctionsAppliedCount={correctionsAppliedCount ?? 0}
                      roleFamily={roleFamily}
                    />

                    <Benefits items={job.benefits ?? []} />

                    <HiringProcess items={job.hiring_process ?? []} />

                    {job.application_status === "offered" && (
                      <>
                        <LeverageSynthesizer jobId={job.id} synthesis={job.leverage_synthesis} />
                        <NegotiationScript jobId={job.id} script={job.negotiation_script} />
                        <NinetyDayPlan jobId={job.id} plan={job.ninety_day_plan} />
                      </>
                    )}

                    <NetworkSignals
                      company={company}
                      previousEmployer={previousEmployer}
                      searchTerms={networkSearchTerms}
                    />
                  </div>
                ),
              },
              {
                id: "company",
                label: "Company",
                content: (
                  <div className="flex flex-col gap-6">
                    <CompanyResearch
                      company={company}
                      jobId={job.id}
                      research={job.company_research}
                    />

                    <StrategicMoatBriefing jobId={job.id} briefing={job.strategic_moat} />

                    <OutreachSignal company={company} signal={hiringSignal} />

                    {job.company_research && (
                      <InsiderConnections
                        jobId={job.id}
                        company={company}
                        connections={job.company_research.insiderConnections}
                        lookedUp={job.company_research.insiderConnectionsLookedUp}
                      />
                    )}
                  </div>
                ),
              },
              ...(isInterviewing
                ? [
                    {
                      id: "interview-prep",
                      label: "Interview Prep Room",
                      content: (
                        // Risk -> Context -> Defense -> Offense reading order
                        // (agy research, 2026-08-14). DOM order itself is
                        // sidebar-first (Trap Door + Panel), then main
                        // (Question Bank + Interrogation Plan) — CSS `order`
                        // only changes VISUAL layout order, not the
                        // accessibility-tree/DOM order a screen reader or
                        // text-extraction follows, so getting Risk-first for
                        // ALL users (not just sighted-desktop ones) requires
                        // the real element order to already be risk-first.
                        // Mobile then needs no reordering at all (DOM order =
                        // visual order); only desktop needs `md:order-*` to
                        // flip sidebar visually onto the right 35% column.
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_22rem] md:items-start">
                          <div className="flex flex-col gap-6 md:order-2">
                            <TrapDoorPredictor jobId={job.id} predictions={job.trap_door_predictions} />
                            <InterviewPanel jobId={job.id} company={company} members={interviewPanelMembers} />
                            <InterviewDebrief
                              jobId={job.id}
                              panelMembers={interviewPanelMembers.map((m) => ({ id: m.id, name: m.name }))}
                            />
                          </div>
                          <div className="flex flex-col gap-6 md:order-1">
                            <QuestionBankPanel
                              initialCompany={company}
                              initialTitle={job.title ?? ""}
                              initialSeniority={job.seniority_level ?? ""}
                              locked
                            />
                            <InterrogationPlan jobId={job.id} plan={job.interrogation_plan} />
                          </div>
                        </div>
                      ),
                    },
                  ]
                : []),
              {
                id: "offer-tools",
                label: "Offer Tools",
                content: (
                  <OfferWorkspace
                    jobId={job.id}
                    offerDetails={job.offer_details}
                    taxEstimateInputs={job.tax_estimate_inputs}
                  />
                ),
              },
            ]}
          />
        </div>

        <div className="fade-in-up" style={{ animationDelay: "240ms" }}>
          <ResumeFitSection
            jobId={job.id}
            company={company}
            analysis={job.resume_analysis}
            modelValue={modelValue}
            isAdmin={isAdmin}
            themeValue={profile?.preferred_resume_theme ?? "modern"}
          />
        </div>
        <div className="fade-in-up" style={{ animationDelay: "300ms" }}>
          <DocumentGenerator
            jobId={job.id}
            resumePdfUrl={application?.resume_pdf_url ?? null}
            coverLetterPdfUrl={application?.cover_letter_pdf_url ?? null}
            applicationStatus={job.application_status}
            markedUnavailableAt={job.marked_unavailable_at}
            droppedFromSearchAt={job.dropped_from_search_at}
            foundAt={job.found_at}
          />
        </div>
        <div className="fade-in-up" style={{ animationDelay: "320ms" }}>
          <EmailDrafts jobId={job.id} />
        </div>
        <FloatingApplyButton applyUrl={applyUrl} company={company} />
      </main>
    </>
  );
}
