// Applies the agreed per-plan usage limits (2026-09-11) to subscription_plans.
//
// Run with:  doppler run -- node scripts/apply-plan-limits.mjs
// Add --dry to print the payload without writing.
//
// WHY THIS EXISTS AS A SCRIPT and not a migration: subscription_plans is
// admin-editable live data, not schema. An owner can change any of these from
// /admin/billing the moment a number turns out wrong, and a migration would
// fight that by reasserting itself on every replay. This is a one-shot
// configuration apply that records exactly what was set and why.
//
// The load-bearing detail: in daily_action_limits, an explicit JSON `null`
// means UNLIMITED and short-circuits the counter entirely (lib/usage.ts's
// `if (override === null) return { allowed: true }`), while an ABSENT key
// falls back to lib/usage.ts's flat DAILY_LIMITS constant. Those are very
// different outcomes, so every action a plan means to make unlimited must be
// written as an explicit null rather than left out.

import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Buckets, so 29 actions stay maintainable as a handful of decisions rather
// than 116 loose numbers. Each group shares a cost profile and a story.
const INTERVIEW_PREP = [
  "interview_question_bank",
  "question_detail_generation",
  "practice_kit_generation",
  "star_story_matching",
  "trap_door_prediction",
  "interrogation_plan",
  "interviewer_research",
];
const STRATEGY = [
  "strategic_moat",
  "leverage_synthesis",
  "negotiation_script",
  "ninety_day_plan",
  "rejection_intelligence",
  "jd_decoder",
];
const CAREER_INSIGHT = [
  "outcome_narrative",
  "brag_doc",
  "market_readiness",
  "skill_gap_synthesis",
  "pipeline_strategy_read",
];
const OUTREACH = ["referral_message", "email_draft", "outreach_message"];

// Zero marginal cost on every tier, and search in particular is table stakes
// — no job portal restricts it, so capping it would make us worse than the
// free alternative a user would otherwise go back to.
const ALWAYS_UNLIMITED = ["search", "resume_analysis", "extension_score_preview"];

function buildLimits({ rewrites, rubric, bullets, interview, strategy, career, outreach, navigator, imports }) {
  const map = {};
  for (const a of ALWAYS_UNLIMITED) map[a] = null;
  map.document_generation = rewrites;
  map.resume_quality_analysis = rubric;
  map.bullet_rewrite = bullets;
  map.agent_message = navigator;
  map.resume_extract = imports;
  for (const a of INTERVIEW_PREP) map[a] = interview;
  for (const a of STRATEGY) map[a] = strategy;
  for (const a of CAREER_INSIGHT) map[a] = career;
  for (const a of OUTREACH) map[a] = outreach;
  return map;
}

const PLANS = {
  // Free tier costs EXACTLY $0/month in recurring API spend: all three paid
  // features (Apify insider lookups $0.315, Apify email lookups $0.10,
  // Perplexity research $0.005) are zeroed out. Everything it does keep runs
  // on the free-tier Gemini key. The line is clean and defensible — free gets
  // everything that costs us nothing.
  recon: {
    daily_action_limits: buildLimits({
      rewrites: 3, rubric: 1, bullets: 10, interview: 2,
      strategy: 1, career: 1, outreach: 3, navigator: 10, imports: 2,
    }),
    // 50, not 3. Job evaluation is charged PER JOB and runs AUTOMATICALLY
    // during a search, which can evaluate up to MAX_EVALUATED_JOBS = 120.
    // At 3 a brand-new free user's very first search scored 3 of 120 jobs
    // and then refused to evaluate anything else all day — reported live on
    // a fresh account that had never clicked evaluate once.
    //
    // 50 is roughly one full useful search. The real cost is far lower than
    // the count suggests: evaluation chunks 10 jobs per AI call, so 50 jobs
    // is ~5 calls on the free-tier Gemini key. Against that key's measured
    // 500 requests/day, this supports ~100 free users doing a search a day.
    job_evaluations_daily_limit: 50,
    company_research_monthly_limit: 0,
    insider_connections_monthly_limit: 0,
    email_lookup_monthly_limit: 0,
  },
  // $15/mo. Worst-case API cost $3.54 -> 76% margin; ~$0.89 at realistic
  // utilisation -> 94%.
  command: {
    daily_action_limits: buildLimits({
      rewrites: 20, rubric: 10, bullets: 60, interview: 15,
      strategy: 10, career: 10, outreach: 20, navigator: 50, imports: 10,
    }),
    // Also raised for the same reason — 25 did not cover a single search.
    // 400 jobs is ~40 AI calls.
    job_evaluations_daily_limit: 400,
    company_research_monthly_limit: 25,
    insider_connections_monthly_limit: 7,
    email_lookup_monthly_limit: 12,
  },
  // $29/mo, the top recurring tier: unlimited on everything that is free to
  // serve. Worst-case $10.60 -> 63% margin; ~$2.65 realistic -> 91%.
  ace: {
    daily_action_limits: buildLimits({
      rewrites: null, rubric: null, bullets: null, interview: null,
      strategy: null, career: null, outreach: null, navigator: null, imports: null,
    }),
    job_evaluations_daily_limit: null,
    company_research_monthly_limit: 60,
    insider_connections_monthly_limit: 20,
    email_lookup_monthly_limit: 40,
  },
  // $149 ONCE, first 150 users. The only tier where revenue stops but cost
  // does not, so the three metered features are capped BELOW Ace on purpose
  // — that is what keeps a lifetime buyer from turning net-negative. At
  // worst-case $4.88/mo the 150-seat cohort stays cash-positive for 30
  // months; at realistic utilisation, ~10 years. Everything free to serve is
  // generous, which is where the offer's appeal actually comes from.
  vanguard: {
    daily_action_limits: buildLimits({
      rewrites: 30, rubric: 20, bullets: null, interview: 25,
      strategy: 20, career: 20, outreach: 30, navigator: 100, imports: 10,
    }),
    job_evaluations_daily_limit: null,
    company_research_monthly_limit: 45,
    insider_connections_monthly_limit: 10,
    email_lookup_monthly_limit: 15,
    max_seats: 150,
  },
};

const dry = process.argv.includes("--dry");

for (const [tier, patch] of Object.entries(PLANS)) {
  if (dry) {
    console.log(`\n${tier}:`, JSON.stringify(patch, null, 1));
    continue;
  }
  const { error } = await db
    .from("subscription_plans")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("tier", tier);
  console.log(`${tier.padEnd(9)} ${error ? "FAILED " + error.message : "updated"}`);
}

if (!dry) {
  const { data } = await db
    .from("subscription_plans")
    .select("tier,price_cents,max_seats,job_evaluations_daily_limit,company_research_monthly_limit,insider_connections_monthly_limit,email_lookup_monthly_limit,daily_action_limits")
    .order("price_cents");
  console.log("\nVERIFY (read back from the database):");
  for (const p of data ?? []) {
    const d = p.daily_action_limits ?? {};
    console.log(
      `${p.tier.padEnd(9)} $${(p.price_cents / 100).toFixed(0).padEnd(4)} seats=${p.max_seats ?? "-"} ` +
        `evals=${p.job_evaluations_daily_limit ?? "unlimited"} research=${p.company_research_monthly_limit} ` +
        `insider=${p.insider_connections_monthly_limit} email=${p.email_lookup_monthly_limit} ` +
        `| keys=${Object.keys(d).length} search=${d.search === null ? "unlimited" : d.search} ` +
        `rewrites=${d.document_generation === null ? "unlimited" : d.document_generation}`,
    );
  }
}
