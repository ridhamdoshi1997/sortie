// End-to-end verification of usage accounting (2026-09-11).
//
// Run with:  doppler run -- node scripts/verify-usage-accounting.mjs
//
// Signs in as the real TEST_ACCOUNT and exercises the ACTUAL enforcement
// path — the SECURITY DEFINER RPCs, as an authenticated user over PostgREST,
// with RLS live. Deliberately not a unit test against mocks: the whole point
// is that the thing which blocks a real request is the thing being measured.
//
// Every probe row it writes is deleted at the end, and it asserts the table
// is back to its starting count before exiting.

import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const user = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const { data: session, error: signInError } = await user.auth.signInWithPassword({
  email: process.env.TEST_ACCOUNT_EMAIL,
  password: process.env.TEST_ACCOUNT_PASSWORD,
});
if (signInError) {
  console.error("sign-in failed:", signInError.message);
  process.exit(1);
}
const userId = session.user.id;
const PROBE = "zz_probe_action";

const { count: startingRows } = await admin.from("usage_daily").select("*", { count: "exact", head: true });
console.log(`signed in as ${session.user.email}\nusage_daily starting rows: ${startingRows}\n`);

// ---------------------------------------------------------------------------
// 1. A finite cap blocks at EXACTLY the limit, never at limit+1.
//    Off-by-one here is the difference between selling 20 rewrites and
//    silently giving away 21.
// ---------------------------------------------------------------------------
const LIMIT = 3;
const results = [];
for (let i = 0; i < 5; i++) {
  const { data } = await user.rpc("increment_usage_daily", { p_action: PROBE, p_limit: LIMIT });
  results.push(data?.[0] ?? null);
}
check("blocks at exactly the cap", results.map((r) => r?.allowed), [true, true, true, false, false]);
check("count stops rising once blocked", results.map((r) => r?.new_count), [1, 2, 3, 3, 3]);

const { data: stored } = await admin
  .from("usage_daily")
  .select("count")
  .eq("user_id", userId)
  .eq("action", PROBE)
  .maybeSingle();
check("stored count matches the RPC's own answer", stored?.count, LIMIT);

// ---------------------------------------------------------------------------
// 2. Concurrency. Five simultaneous requests against a cap of 3 must let
//    through exactly 3 — a read-then-write would let all five past, which is
//    the exact bug the 2026-08-29 migration moved this into an RPC to close.
// ---------------------------------------------------------------------------
await admin.from("usage_daily").delete().eq("user_id", userId).eq("action", PROBE);
const concurrent = await Promise.all(
  Array.from({ length: 5 }, () => user.rpc("increment_usage_daily", { p_action: PROBE, p_limit: LIMIT })),
);
const allowedCount = concurrent.filter((r) => r.data?.[0]?.allowed).length;
check("concurrent requests cannot exceed the cap", allowedCount, LIMIT);

// ---------------------------------------------------------------------------
// 3. The quota-reset bypass stays closed. A signed-in user must not be able
//    to write their own counter back down — the original vulnerability.
// ---------------------------------------------------------------------------
const { error: updateError } = await user
  .from("usage_daily")
  .update({ count: 0 })
  .eq("user_id", userId)
  .eq("action", PROBE);
const { data: afterTamper } = await admin
  .from("usage_daily")
  .select("count")
  .eq("user_id", userId)
  .eq("action", PROBE)
  .maybeSingle();
check("direct UPDATE cannot reset the counter", afterTamper?.count, LIMIT);
console.log(`        (client UPDATE ${updateError ? "rejected: " + updateError.message.slice(0, 48) : "silently no-opped by RLS"})`);

// ---------------------------------------------------------------------------
// 3b. A limit of 0 blocks EVERY call, including the day's first.
//     Regression guard for a real bug: the guard used to read
//     `v_count IS NOT NULL AND v_count >= p_limit`, and on the first call of
//     the day v_count is NULL, so it fell through to the INSERT and allowed
//     one use. Every non-zero limit hid it. It matters because the admin
//     portal lets an owner set a per-action limit to 0 to mean "not included
//     in this tier" — which was silently granting one free use per day.
// ---------------------------------------------------------------------------
await admin.from("usage_daily").delete().eq("user_id", userId).eq("action", PROBE);
const zeroResults = [];
for (let i = 0; i < 2; i++) {
  const { data } = await user.rpc("increment_usage_daily", { p_action: PROBE, p_limit: 0 });
  zeroResults.push(data?.[0] ?? null);
}
check("a limit of 0 blocks the first call too", zeroResults.map((r) => r?.allowed), [false, false]);
check("a blocked-at-zero call writes no count", zeroResults.map((r) => r?.new_count), [0, 0]);
const { count: zeroRows } = await admin
  .from("usage_daily")
  .select("*", { count: "exact", head: true })
  .eq("user_id", userId)
  .eq("action", PROBE);
check("a limit of 0 creates no usage row at all", zeroRows, 0);

// ---------------------------------------------------------------------------
// 4. Metering without capping — the admin path. record_usage_daily must
//    increment forever and never block, which is what makes /admin/expenses
//    able to report spend at all.
// ---------------------------------------------------------------------------
await admin.from("usage_daily").delete().eq("user_id", userId).eq("action", PROBE);
const recorded = [];
for (let i = 0; i < 4; i++) {
  const { data } = await user.rpc("record_usage_daily", { p_action: PROBE });
  recorded.push(data?.[0]?.new_count ?? null);
}
check("metering increments without any cap", recorded, [1, 2, 3, 4]);

// ---------------------------------------------------------------------------
// 4b. Metering by amount (Phase 54). Search scoring records a whole search's
//     jobs in one call. A non-positive amount would be a quota reset by
//     another name, so it must be refused.
// ---------------------------------------------------------------------------
{
  const { data } = await user.rpc("record_usage_daily", { p_action: PROBE, p_amount: 5 });
  check("record_usage_daily adds a whole amount", data?.[0]?.new_count ?? null, 9);
  const { error: zeroErr } = await user.rpc("record_usage_daily", { p_action: PROBE, p_amount: 0 });
  check("an amount of 0 is refused", Boolean(zeroErr), true);
  const { error: negErr } = await user.rpc("record_usage_daily", { p_action: PROBE, p_amount: -9 });
  check("a negative amount is refused", Boolean(negErr), true);
}

// ---------------------------------------------------------------------------
// 4c. Service-role metering (Phase 54). Background jobs and bearer-token
//     routes have no signed-in user, so the user-scoped RPCs refuse them —
//     which silently broke résumé suggestions and the extension score badge.
//     The *_for variants take the user explicitly and must stay closed to
//     every signed-in user.
// ---------------------------------------------------------------------------
{
  await admin.from("usage_daily").delete().eq("user_id", userId).eq("action", PROBE);
  const { error: userForErr } = await user.rpc("increment_usage_daily_for", { p_user_id: userId, p_action: PROBE, p_limit: 3 });
  check("a signed-in user cannot call the service-role variant", Boolean(userForErr), true);
  const { error: plainServiceErr } = await admin.rpc("record_usage_daily", { p_action: PROBE });
  check("the user-scoped RPC refuses a service-role client", /not authenticated/i.test(plainServiceErr?.message ?? ""), true);
  const serviceResults = [];
  for (let i = 0; i < 3; i++) {
    const { data } = await admin.rpc("increment_usage_daily_for", { p_user_id: userId, p_action: PROBE, p_limit: 2 });
    serviceResults.push(data?.[0]?.allowed ?? null);
  }
  check("service-role increments enforce the same cap", serviceResults, [true, true, false]);
  const { data: rec } = await admin.rpc("record_usage_daily_for", { p_user_id: userId, p_action: PROBE, p_amount: 3 });
  check("service-role recording adds to the same row", rec?.[0]?.new_count ?? null, 5);
}

// ---------------------------------------------------------------------------
// 4d. The user's own day (Phase 54). Kiritimati (UTC+14) and Pago Pago
//     (UTC-11) are 25 hours apart, so their dates ALWAYS differ — if the day
//     were still computed in UTC, at least one of these would fail.
// ---------------------------------------------------------------------------
{
  const { data: before } = await admin.from("profiles").select("timezone").eq("id", userId).single();
  const originalTz = before?.timezone ?? null;
  const localDay = (tz) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  for (const tz of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
    // Service role, so the once-a-day change limit does not apply to the test.
    await admin.from("profiles").update({ timezone: tz }).eq("id", userId);
    const { data: win } = await user.rpc("my_usage_window");
    check(`${tz}: the usage day is that zone's date`, win?.[0]?.day, localDay(tz));
    await admin.from("usage_daily").delete().eq("user_id", userId).eq("action", PROBE);
    await user.rpc("record_usage_daily", { p_action: PROBE });
    const { data: row } = await admin.from("usage_daily").select("day").eq("user_id", userId).eq("action", PROBE).maybeSingle();
    check(`${tz}: usage is written to that zone's date`, row?.day, localDay(tz));
  }

  const { data: kept } = await user.rpc("set_my_timezone", { p_timezone: "Asia/Tokyo" });
  check("a user's second timezone change within 24h is ignored", kept, "Pacific/Pago_Pago");
  const { error: badTz } = await user.rpc("set_my_timezone", { p_timezone: "Mars/Olympus_Mons" });
  check("an unknown timezone is rejected", Boolean(badTz), true);

  await admin.from("profiles").update({ timezone: originalTz }).eq("id", userId);
  const { data: restored } = await admin.from("profiles").select("timezone").eq("id", userId).single();
  check("the test account's timezone is restored", restored?.timezone ?? null, originalTz);
}

// ---------------------------------------------------------------------------
// 5. Plan limits actually resolve the way lib/usage.ts will read them.
//    An explicit null means unlimited and skips the counter; an ABSENT key
//    silently falls back to the flat DAILY_LIMITS constant, which is how a
//    plan ends up not unlocking what it advertises.
// ---------------------------------------------------------------------------
const { data: plans } = await admin
  .from("subscription_plans")
  .select("tier,daily_action_limits,job_evaluations_daily_limit")
  .order("price_cents");

const EXPECTED_ACTION_COUNT = 29;
for (const p of plans ?? []) {
  const map = p.daily_action_limits ?? {};
  check(`${p.tier}: every metered action is configured`, Object.keys(map).length, EXPECTED_ACTION_COUNT);
  check(`${p.tier}: search is explicitly unlimited`, map.search, null);
}

const recon = plans.find((p) => p.tier === "recon");
const ace = plans.find((p) => p.tier === "ace");
check("recon caps résumé rewrites at 3/day", recon.daily_action_limits.document_generation, 3);
// Rescoped 3 -> 10 when search stopped charging this allowance (Phase 53).
check("recon caps user-requested evaluations at 10/day", recon.job_evaluations_daily_limit, 10);
check("ace makes résumé rewrites unlimited", ace.daily_action_limits.document_generation, null);
check("ace makes AI evaluations unlimited", ace.job_evaluations_daily_limit, null);

// ---------------------------------------------------------------------------
// Cleanup — the table must end exactly where it started.
// ---------------------------------------------------------------------------
await admin.from("usage_daily").delete().eq("user_id", userId).eq("action", PROBE);
const { count: endingRows } = await admin.from("usage_daily").select("*", { count: "exact", head: true });
check("all probe rows removed", endingRows, startingRows);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
