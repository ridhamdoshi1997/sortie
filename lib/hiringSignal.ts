import { createAdminClient } from "@/lib/admin/client";

// Signal-based outreach automation, free half (Phase 18 item 5,
// context/RESUME.md). No paid Clay/Apollo account exists yet — this
// substitutes a real, free, already-collected signal: how many postings
// from this company have been found across ALL Sortie users recently,
// compared to the prior window. A genuine rising-posting-volume signal
// (real hiring activity), not a fabricated one. Cross-user aggregate
// counts only — never exposes another user's individual job rows, same
// justification as lib/admin/geoContent.ts and getPublishedPageBySlug's
// own documented service-role-for-one-narrow-aggregate-read pattern. Kept
// as a local helper (not lib/admin/client.ts's createAdminDbClient, which
// is documented admin-route-only) since this runs on a normal consumer
// page view, same shape as actions/account.ts/actions/referrals.ts's own
// local service-client helpers.
function serviceClient() {
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_SIGNAL_COUNT = 3;

export type HiringSignal = {
  recentCount: number;
  priorCount: number;
  trending: boolean;
};

export async function getCompanyHiringSignal(company: string | null | undefined): Promise<HiringSignal | null> {
  const trimmed = company?.trim();
  if (!trimmed || trimmed === "this company") return null;

  const admin = serviceClient();
  const sinceIso = new Date(Date.now() - 2 * WINDOW_MS).toISOString();

  const { data } = await admin.database
    .from("jobs")
    .select("found_at")
    .ilike("company", trimmed)
    .gte("found_at", sinceIso);

  const rows = (data ?? []) as { found_at: string | null }[];
  if (rows.length === 0) return { recentCount: 0, priorCount: 0, trending: false };

  const cutoff = Date.now() - WINDOW_MS;
  let recentCount = 0;
  let priorCount = 0;
  for (const row of rows) {
    if (!row.found_at) continue;
    if (new Date(row.found_at).getTime() >= cutoff) recentCount++;
    else priorCount++;
  }

  return {
    recentCount,
    priorCount,
    trending: recentCount >= MIN_SIGNAL_COUNT && recentCount > priorCount,
  };
}
