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
  | "question_detail_generation"
  | "practice_kit_generation"
  | "agent_message"
  | "outcome_narrative"
  | "brag_doc"
  | "market_readiness"
  | "job_chat"
  | "extension_score_preview";

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
  // Practice Sandbox (build-plan.md §N/§P, Tier 3) — same lazy-per-question,
  // cache-hit-is-free-read shape as question_detail_generation above, just a
  // separate action since it generates a different artifact (a runnable
  // JS/Python exercise, not study text). Free-tier Gemini, same cap as its
  // sibling.
  practice_kit_generation: 20,
  // Navigator (§O) — a conversational feature, same reasoning as
  // bullet_rewrite: free-tier Gemini, no external cost, and a real
  // conversation plausibly needs several turns in a row, so it gets a
  // generous cap rather than a tight one-shot-feature cap.
  agent_message: 30,
  // §Q3 — one structured call over stats this app already computed
  // (lib/outcomeInsights.ts, zero AI), same cost/shape as
  // rejection_intelligence/leverage_synthesis. Not eagerly generated on
  // every /career visit — opt-in button click only, so the cap mainly
  // guards against repeated re-generation for no new data.
  outcome_narrative: 5,
  // §Q4 — one structured call over the user's own logged accomplishments +
  // compensation events within a picked date range, same shape/cost as
  // outcome_narrative/leverage_synthesis. Not persisted, so re-opening the
  // same period later costs another call — capped the same way as those.
  brag_doc: 5,
  // "Market Readiness" (build-plan.md §E, the free pivot of Passive
  // market-watch) — same shape/cost as brag_doc: one structured call over
  // the user's own already-stored accomplishments + target titles, no
  // external lookup. Not persisted, so re-checking later costs another
  // call, same reasoning as brag_doc's own cap.
  market_readiness: 5,
  // "Ask Orion" per-job chat (build-plan.md §B) — same shape/cost as
  // agent_message (Navigator): free-tier Gemini, no external lookup, and a
  // real conversation plausibly needs several turns, so it gets a generous
  // cap rather than a tight one-shot-feature cap.
  job_chat: 30,
  // The extension's inline match-score badge — fires while the user is just
  // BROWSING job postings, not applying, so it needs a higher cap than a
  // deliberate one-shot action like brag_doc. Most of the real cost is
  // avoided anyway: a genuine cache hit (a job with this exact title+company
  // already tracked with a score) never reaches this action at all — see
  // app/api/extension/score-preview/route.ts. This only bounds the
  // remaining genuine-miss case (browsing new postings never seen before).
  extension_score_preview: 40,
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
  practice_kit_generation: "practice sandbox exercises",
  agent_message: "Navigator messages",
  outcome_narrative: "outcome insight summaries",
  brag_doc: "brag doc generations",
  market_readiness: "market readiness checks",
  job_chat: "Ask Orion messages",
  extension_score_preview: "extension match-score previews",
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
  // The global kill switch — checked first, before per-user suspension and
  // before the admin exemption, deliberately with NO exceptions (including
  // ADMIN_EMAILS accounts). It exists for a runaway-bug or bot-spam
  // scenario where the whole point is stopping every AI call app-wide, not
  // just for most users. lib/admin/queries.ts's getAppSettings() reads the
  // same row; kept as a direct query here rather than importing that
  // module, since lib/admin/ pulls in the service-role client and this
  // file must stay usable from the cookie-scoped client alone.
  const { data: settings } = await insforge.database
    .from("app_settings")
    .select("ai_enabled,ai_disabled_reason")
    .eq("id", 1)
    .maybeSingle<{ ai_enabled: boolean; ai_disabled_reason: string | null }>();

  if (settings && !settings.ai_enabled) {
    return {
      allowed: false,
      error: settings.ai_disabled_reason || "AI features are temporarily disabled. Please check back shortly.",
    };
  }

  // Checked before the admin exemption below, and at this exact choke
  // point rather than only in a UI layout — every AI-costing action in the
  // app routes through here, so this is the one place a suspension
  // actually blocks usage regardless of which page/action triggered it
  // (a real gotcha flagged during the admin panel's design: checking
  // suspension only in a React layout lets a user keep clicking around on
  // stale client-side cache for a while).
  const { data: profile } = await insforge.database
    .from("profiles")
    .select("is_suspended,custom_usage_multiplier")
    .eq("id", userId)
    .maybeSingle<{ is_suspended: boolean; custom_usage_multiplier: number }>();

  if (profile?.is_suspended) {
    return { allowed: false, error: "This account has been suspended. Contact support if you believe this is a mistake." };
  }

  if (isAdminUser(email)) {
    return { allowed: true };
  }

  // Rounds down, floor of 1 — a multiplier is meant to scale a cap up or
  // down, never to silently zero someone out (suspend already covers that
  // case explicitly and with a clear error message).
  const multiplier = profile?.custom_usage_multiplier ?? 1;
  const limit = Math.max(1, Math.floor(DAILY_LIMITS[action] * multiplier));
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
