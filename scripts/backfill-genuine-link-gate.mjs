// One-time backfill (2026-09-01, updated same day after the genuine-link
// bar was widened from "LinkedIn only" to "any trusted major board") —
// applies lib/inngest/functions.ts's persist-chunk hard-hide gate to jobs
// that were already scored BEFORE that gate existed or before the bar was
// widened. A job only goes through the gate once, at its first
// evaluation, and the "don't re-score already-evaluated jobs" fix means
// these jobs will never naturally get re-checked on their own. Free-tier
// resolution only (no paid SerpApi/Apify calls) — this is a retroactive
// backfill of existing data, not a live search, so it defaults to zero
// additional real spend.
//
// Does two passes:
// 1. RESTORE: jobs currently hidden that were only ever hidden for the
//    now-too-strict "aggregator but not LinkedIn" reason get un-hidden —
//    but ONLY when their stored AI legitimacy grade is confirmed NOT D/F
//    (there's no stored "why was this hidden" reason, so this is the
//    only safe way to avoid resurrecting a job that's hidden for a
//    different, still-valid reason).
// 2. GATE: the original pass — visible, already-scored jobs whose link
//    still isn't genuine (now: ats/employer/any trusted aggregator, no
//    longer LinkedIn-only) get a free resolution attempt, then hidden if
//    that still doesn't reach the bar.
//
// Run with: npx tsx --env-file=.env scripts/backfill-genuine-link-gate.mjs [userId]
import { createAdminClient } from "@insforge/sdk";
import { classifyApplyHost } from "../lib/applyLinkTrust.ts";
import { reresolveApplyLinkForJob } from "../lib/reresolveApplyLink.ts";

const admin = createAdminClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
  apiKey: process.env.INSFORGE_API_KEY,
});

const CONCURRENCY = 8;

function meetsGenuineBar(url, company) {
  if (!url) return false;
  const trust = classifyApplyHost(url, company);
  return trust === "ats" || trust === "employer" || trust === "aggregator";
}

function legitimacyGrade(evaluation) {
  const dim = Array.isArray(evaluation) ? evaluation.find((d) => d.dimension === "Legitimacy") : null;
  return dim?.grade ?? null;
}

async function restoreJob(job) {
  const grade = legitimacyGrade(job.evaluation);
  if (grade === "D" || grade === "F") return "left-hidden"; // still genuinely disqualified
  if (!meetsGenuineBar(job.external_apply_url, job.company)) return "left-hidden"; // still not genuine
  const { error } = await admin.database.from("jobs").update({ is_hidden: false }).eq("id", job.id);
  if (error) console.error(`[backfill] restore failed for ${job.id}`, error.message);
  return "restored";
}

async function processJob(job) {
  if (meetsGenuineBar(job.external_apply_url, job.company)) {
    return "already-genuine";
  }

  try {
    await reresolveApplyLinkForJob(admin, {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      external_apply_url: job.external_apply_url,
      raw_apply_options: job.raw_apply_options,
    }, { freeOnly: true });
  } catch (err) {
    console.error(`[backfill] resolution attempt failed for ${job.id}`, err.message);
  }

  const { data: refetched } = await admin.database.from("jobs").select("external_apply_url").eq("id", job.id).maybeSingle();
  const finalUrl = refetched?.external_apply_url ?? job.external_apply_url;

  if (meetsGenuineBar(finalUrl, job.company)) return "upgraded";

  await admin.database.from("jobs").update({ is_hidden: true }).eq("id", job.id);
  return "hidden";
}

// Scoped to a single user_id for the first run (direct user request,
// 2026-09-01) so the effect can be reviewed before this touches every
// other user's data — pass a user id as argv[2], or omit to run
// unscoped (every user) once that review is done.
const scopeUserId = process.argv[2] ?? null;

async function main() {
  console.log(scopeUserId ? `Scoped to user ${scopeUserId}` : "UNSCOPED — running for every user");

  // Pass 1: restore
  let restoreQuery = admin.database
    .from("jobs")
    .select("id,title,company,external_apply_url,evaluation")
    .eq("is_hidden", true)
    .not("match_score", "is", null);
  if (scopeUserId) restoreQuery = restoreQuery.eq("user_id", scopeUserId);
  const { data: hiddenJobs, error: restoreErr } = await restoreQuery;
  if (restoreErr) throw restoreErr;

  console.log(`\nPass 1 — reviewing ${hiddenJobs.length} currently-hidden jobs for restoration...`);
  const restoreCounts = { restored: 0, "left-hidden": 0 };
  for (let i = 0; i < hiddenJobs.length; i += CONCURRENCY) {
    const batch = hiddenJobs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(restoreJob));
    for (const r of results) restoreCounts[r]++;
  }
  console.log("Pass 1 result:", restoreCounts);

  // Pass 2: gate (original backfill)
  let gateQuery = admin.database
    .from("jobs")
    .select("id,title,company,location,external_apply_url,raw_apply_options")
    .eq("is_hidden", false)
    .not("match_score", "is", null)
    .not("external_apply_url", "is", null);
  if (scopeUserId) gateQuery = gateQuery.eq("user_id", scopeUserId);
  const { data: jobs, error } = await gateQuery;
  if (error) throw error;
  console.log(`\nPass 2 — processing ${jobs.length} already-scored, visible jobs...`);

  const counts = { "already-genuine": 0, upgraded: 0, hidden: 0 };
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(processJob));
    for (const r of results) counts[r]++;
    console.log(`  ${Math.min(i + CONCURRENCY, jobs.length)}/${jobs.length} processed — genuine: ${counts["already-genuine"]}, upgraded: ${counts.upgraded}, hidden: ${counts.hidden}`);
  }

  console.log("\nFinal (pass 2):", counts);
}

main();
