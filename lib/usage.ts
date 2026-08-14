import type { createInsforgeServer } from "@/lib/insforge-server";
import { isAdminUser } from "@/lib/access";

type Insforge = Awaited<ReturnType<typeof createInsforgeServer>>;

// Minimum-cost public launch policy (see progress-tracker.md "Phase 0").
// Every action here triggers a real external cost — an AI call, a
// Browserbase session, or a SerpApi search — so each gets a conservative
// per-user daily cap on the free plan. Admins (lib/access.ts) are unmetered.
export type UsageAction =
  | "search"
  | "document_generation"
  | "company_research"
  | "resume_extract"
  | "resume_analysis"
  | "resume_quality_analysis"
  | "insider_connections"
  | "email_lookup"
  | "bullet_rewrite"
  | "rejection_intelligence"
  | "strategic_moat"
  | "interviewer_research"
  | "leverage_synthesis"
  | "interview_question_bank"
  | "trap_door_prediction"
  | "interrogation_plan"
  | "star_story_matching"
  | "question_detail_generation";

const DAILY_LIMITS: Record<UsageAction, number> = {
  search: 5,
  document_generation: 10,
  company_research: 3,
  resume_extract: 5,
  // Cheaper than a full generation (one short structured call, no PDF render)
  // and it's the step users take *before* deciding to generate, so it gets a
  // higher cap — gating it too tightly would push people to generate blind.
  resume_analysis: 15,
  // Distinct from resume_analysis above (that's the résumé-vs-one-job gap
  // check) — this is the whole-résumé quality grade (10-dimension matrix +
  // narrative alignment + interviewer-skepticism vulnerabilities +
  // per-bullet issues) in one larger structured call, closer in shape/cost
  // to a full document_generation than a quick fit check. JobRight's own
  // observed pattern for the equivalent feature is 1-2/day free — matched
  // here rather than guessed.
  resume_quality_analysis: 3,
  // ~$0.31-0.32/call (3 Apify people-search pages + company-URL resolves) —
  // the most expensive single action in the app, capped tightly.
  insider_connections: 3,
  // Originally planned at ~$0.01/call via dev_fusion, but that actor is
  // blocked on Apify's free plan for API calls — reworked to use
  // HarvestAPI's own search actor instead (same vendor as everything else),
  // which is closer to its ~$0.10/search-page rate per lookup. Capped down
  // from the original 10/day to match the real cost, not the cheaper one
  // originally planned.
  email_lookup: 4,
  // Free-tier Gemini, no real $ cost — but still shares the same rate-limited
  // key as evaluation/extraction, and a single work-experience edit can
  // plausibly trigger several of these in a row (rewrite each bullet, then
  // generate a few more), so it gets a generous but real cap rather than
  // none at all.
  bullet_rewrite: 30,
  // One structured call against data the app already has (a job's own
  // stored evaluation) — cheap in the same way bullet_rewrite is, but capped
  // tighter since it's a new, unvalidated feature rather than a proven one.
  rejection_intelligence: 5,
  // Tries a free Jina-Reader search-page fetch first; only falls to the
  // real ~$0.005/call Perplexity path (same as company_research's fallback)
  // when that comes up thin. Capped like company_research since it shares
  // the same worst-case cost profile.
  strategic_moat: 3,
  // Same free-first-then-Perplexity cost profile as strategic_moat, capped
  // the same way. Adding a panelist itself is free; only the "research
  // background" action consumes this.
  interviewer_research: 5,
  // Same shape/cost as rejection_intelligence — one structured call against
  // data the app already has (this job's own stored evaluation, timing, and
  // signals), no external lookup involved.
  leverage_synthesis: 5,
  // Only consumed on a real cache MISS (lib/interviewQuestions.ts) — a hit
  // against an already-generated (company, role_family, seniority) bank is
  // a free read, no AI call, no usage consumed. Free-tier Gemini, capped
  // like bullet_rewrite/strategic_moat rather than left unmetered, since a
  // determined user could otherwise probe many company/role/seniority
  // combinations in a row to force fresh generations.
  interview_question_bank: 5,
  // Same shape/cost as rejection_intelligence/leverage_synthesis — one
  // structured call on already-stored job data (company research, strategic
  // moat, scope-mismatch flag), no external fetch of its own.
  trap_door_prediction: 5,
  // Same profile as trap_door_prediction — synthesizes already-stored
  // strategic_moat + interview_panel_members data, no new external lookup.
  interrogation_plan: 5,
  // One structured call over the user's own star_stories plus a question
  // bank list (that half is separately metered by interview_question_bank
  // on a real cache miss) — same cost profile as rejection_intelligence.
  star_story_matching: 5,
  // Lazy per-question deep study content (lib/interviewQuestions.ts's
  // generateQuestionDetails) — a small, focused call per question, cheaper
  // than a full bank generation, and a natural per-click action while
  // studying (a candidate might expand many questions in one session).
  // Free-tier Gemini, shares the same cache-hit-is-free-read shape as
  // interview_question_bank: only a genuine miss (details not yet generated
  // for that question) consumes this.
  question_detail_generation: 20,
};

const ACTION_LABELS: Record<UsageAction, string> = {
  search: "job searches",
  document_generation: "document generations",
  company_research: "company research runs",
  resume_extract: "resume imports",
  resume_analysis: "resume fit checks",
  resume_quality_analysis: "resume quality analyses",
  insider_connections: "insider connection lookups",
  email_lookup: "email lookups",
  bullet_rewrite: "AI bullet rewrites/generations",
  rejection_intelligence: "rejection diagnoses",
  strategic_moat: "strategic moat briefings",
  interviewer_research: "interviewer background lookups",
  leverage_synthesis: "leverage syntheses",
  interview_question_bank: "interview question bank generations",
  trap_door_prediction: "trap door predictions",
  interrogation_plan: "interrogation plan syntheses",
  star_story_matching: "STAR story matches",
  question_detail_generation: "question deep-dives",
};

type UsageResult = { allowed: true } | { allowed: false; error: string };

// Read-then-write, not an atomic upsert — an acceptable race window at this
// scale (worst case a user squeezes in one extra call past a small daily
// cap), and it avoids standing up a Postgres RPC function just for this.
export async function checkAndConsumeUsage(
  insforge: Insforge,
  userId: string,
  email: string | null | undefined,
  action: UsageAction,
): Promise<UsageResult> {
  if (isAdminUser(email)) {
    return { allowed: true };
  }

  const limit = DAILY_LIMITS[action];
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await insforge.database
    .from("usage_daily")
    .select("id,count")
    .eq("user_id", userId)
    .eq("day", today)
    .eq("action", action)
    .maybeSingle<{ id: string; count: number }>();

  const currentCount = existing?.count ?? 0;
  if (currentCount >= limit) {
    return {
      allowed: false,
      error: `Daily limit reached for ${ACTION_LABELS[action]} (${limit}/day on the free plan) — try again tomorrow.`,
    };
  }

  if (existing) {
    await insforge.database
      .from("usage_daily")
      .update({ count: currentCount + 1 })
      .eq("id", existing.id);
  } else {
    await insforge.database
      .from("usage_daily")
      .insert([{ user_id: userId, day: today, action, count: 1 }]);
  }

  return { allowed: true };
}
