// One-off live verification for the 2026-08-28 global full-text search
// feature (migration 20260828180000, search_jobs() RPC, actions/jobs.ts's
// searchJobsFullText()) -- signs in as the real test account with the
// public anon client (same auth path a real browser session uses) and
// calls the real search_jobs RPC, so auth.uid()/RLS resolve correctly
// (the admin/service client used elsewhere has no user JWT, so auth.uid()
// would be null there).
//
// Run with:
//   node --env-file=.env scripts/verify-full-text-search.mjs
import { createClient } from "@insforge/sdk";

const client = createClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
  anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
});

const { error: signInError } = await client.auth.signInWithPassword({
  email: process.env.TEST_ACCOUNT_EMAIL,
  password: process.env.TEST_ACCOUNT_PASSWORD,
});
if (signInError) {
  console.error("sign-in failed:", signInError);
  process.exit(1);
}

const queries = ["software engineer", "remote", "python backend"];
for (const q of queries) {
  const { data, error } = await client.database.rpc("search_jobs", { p_query: q, p_limit: 5, p_offset: 0 });
  if (error) {
    console.log(`[${q}] ERROR:`, error);
    continue;
  }
  console.log(`\n[${q}] ${data.length} result(s)`);
  for (const row of data) {
    console.log(`  - ${row.title} @ ${row.company} (rank=${row.rank.toFixed(3)}, status=${row.application_status})`);
    console.log(`    snippet: ${row.snippet}`);
  }
}
