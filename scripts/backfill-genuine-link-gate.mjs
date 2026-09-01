// One-time backfill (2026-09-01): applies the "genuine portal or LinkedIn
// only" hard-hide gate (lib/inngest/functions.ts's persist-chunk step) to
// jobs that were already scored BEFORE that gate existed. A job only goes
// through the gate once, at its first evaluation, and the earlier
// "don't re-score already-evaluated jobs" fix means these jobs will never
// naturally get re-checked on their own. Free-tier resolution only (no
// paid SerpApi/Apify calls) — this is a retroactive backfill of existing
// data, not a live search, so it defaults to zero additional real spend.
// Run with: node --env-file=.env scripts/backfill-genuine-link-gate.mjs
import { createAdminClient } from "@insforge/sdk";
import { classifyApplyHost, isLinkedInHost } from "../lib/applyLinkTrust.ts";
import { reresolveApplyLinkForJob } from "../lib/reresolveApplyLink.ts";

const admin = createAdminClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
  apiKey: process.env.INSFORGE_API_KEY,
});

const CONCURRENCY = 8;

async function processJob(job) {
  const currentTrust = classifyApplyHost(job.external_apply_url, job.company);
  if (currentTrust === "ats" || currentTrust === "employer" || (currentTrust === "aggregator" && isLinkedInHost(job.external_apply_url))) {
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
  const finalTrust = finalUrl ? classifyApplyHost(finalUrl, job.company) : "unverified";
  const meetsGenuineBar = finalTrust === "ats" || finalTrust === "employer" || (finalTrust === "aggregator" && isLinkedInHost(finalUrl));

  if (meetsGenuineBar) return "upgraded";

  await admin.database.from("jobs").update({ is_hidden: true }).eq("id", job.id);
  return "hidden";
}

// Scoped to a single user_id for the first run (direct user request,
// 2026-09-01) so the effect can be reviewed before this touches every
// other user's data — pass a user id as argv[2], or omit to run
// unscoped (every user) once that review is done.
const scopeUserId = process.argv[2] ?? null;

async function main() {
  let query = admin.database
    .from("jobs")
    .select("id,title,company,location,external_apply_url,raw_apply_options")
    .eq("is_hidden", false)
    .not("match_score", "is", null)
    .not("external_apply_url", "is", null);
  if (scopeUserId) query = query.eq("user_id", scopeUserId);

  const { data: jobs, error } = await query;
  if (error) throw error;
  console.log(scopeUserId ? `Scoped to user ${scopeUserId}` : "UNSCOPED — running for every user");
  console.log(`Processing ${jobs.length} already-scored, visible jobs...`);

  const counts = { "already-genuine": 0, upgraded: 0, hidden: 0 };
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(processJob));
    for (const r of results) counts[r]++;
    console.log(`  ${Math.min(i + CONCURRENCY, jobs.length)}/${jobs.length} processed — genuine: ${counts["already-genuine"]}, upgraded: ${counts.upgraded}, hidden: ${counts.hidden}`);
  }

  console.log("\nFinal:", counts);
}

main();
