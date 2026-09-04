import { toCompanyKey } from "@/lib/atsRegistry";
import { canonicalCompanyKey, compareCompanyKeys } from "@/lib/companyIdentity";

// Is this job still open on the EMPLOYER'S OWN careers board?
//
// This is the one question no job board can answer about its own listings,
// and the reason is structural rather than technical: aggregators receive
// postings by XML/API syndication, and those feeds are reliable at
// announcing a new role and unreliable at announcing a closed one. That is
// where "ghost jobs" come from — Indeed or LinkedIn still showing a
// requisition the employer filled weeks ago.
//
// We are in a different position because lib/proactiveAtsCrawl.ts polls the
// employer's Greenhouse/Lever/Ashby/Workday/iCIMS board directly and marks
// `discovered_postings.is_active = false` when a posting stops appearing.
// Measured 2026-09-04: 21,652 postings we actually watched disappear,
// against 465,439 still live.
//
// DELIBERATELY CONSERVATIVE, in two distinct ways.
//
// 1. Three states, and "unknown" is the common one:
//      open     — the employer's own board still lists this role
//      closed   — we previously saw it on their board and it is gone
//      unknown  — we do not crawl this employer, or cannot match the posting
//    "unknown" is never dressed up as either of the others.
//
// 2. The bar for "closed" is HIGHER than for "open", on purpose. Telling
//    someone a live job is dead costs them an application they should have
//    sent; telling them a dead job is live costs them a wasted click. Those
//    are not symmetric, so a `closed` verdict requires an EXACT company-key
//    match, while `open` also accepts a canonical match ("BMO" vs
//    "bmocampus" — see lib/companyIdentity.ts). A canonical match that
//    looks closed is downgraded to `unknown` rather than asserted.

export type LivenessState = "open" | "closed" | "unknown";

export type LivenessVerdict = {
  state: LivenessState;
  /** When the employer's board last showed this posting. */
  lastSeenAt?: string | null;
  /** How the employer was matched — `exact` is required for `closed`. */
  matchedOn?: "exact" | "canonical";
};

type Filterable = {
  select: (cols: string) => {
    in: (col: string, vals: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
};

type AdminDb = { database: { from: (table: string) => Filterable } };

type PostingRow = {
  company_key: string;
  company_stem: string | null;
  title: string | null;
  is_active: boolean;
  last_seen_at: string | null;
};

// Title comparison is normalised on both sides and then required to match
// EXACTLY. A looser rule (word overlap, prefix) would match "Senior
// Financial Advisor" against "Financial Advisor" and then declare one
// closed on the strength of the other — inventing a claim about a posting
// we never tracked. Exact-after-normalising is the only bar that cannot
// produce that failure.
function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type LivenessInput = { id: string; company?: string | null; title?: string | null };

/**
 * Batched: one query for a whole result set, not one per job.
 * Returns entries only for jobs we can say something real about.
 */
export async function getLivenessForJobs(
  admin: AdminDb,
  jobs: LivenessInput[],
): Promise<Map<string, LivenessVerdict>> {
  const verdicts = new Map<string, LivenessVerdict>();
  if (jobs.length === 0) return verdicts;

  const keyed = jobs
    .map((job) => ({
      job,
      key: toCompanyKey(job.company ?? ""),
      stem: canonicalCompanyKey(toCompanyKey(job.company ?? "")),
      title: normalizeTitle(job.title),
    }))
    .filter((entry) => entry.key && entry.stem && entry.title);
  if (keyed.length === 0) return verdicts;

  // Query on the STEM, not the raw key. Measured before this: of 18
  // employers returned by a real LinkedIn+Indeed search, exactly ONE
  // matched our crawl on an exact key, because the crawl stores
  // bmocampus / cibccampus / tdbank while the aggregators say BMO / CIBC /
  // TD. company_stem is maintained by the crawl writer from the same
  // canonicalCompanyKey() used here, so both sides always agree.
  const stems = [...new Set(keyed.map((entry) => entry.stem))];

  const { data, error } = await admin.database
    .from("discovered_postings")
    .select("company_key,company_stem,title,is_active,last_seen_at")
    .in("company_stem", stems);

  if (error) {
    // Liveness is additive context. A failure here must never take down a
    // search that is otherwise fine — every job simply stays "unknown".
    console.error("[postingLiveness] lookup failed", error.message);
    return verdicts;
  }

  // stem -> normalised title -> rows. A posting can legitimately appear
  // more than once (two locations, a repost, sibling boards), so keep them
  // all and choose per job below.
  const index = new Map<string, Map<string, PostingRow[]>>();
  for (const row of (data ?? []) as PostingRow[]) {
    const titleKey = normalizeTitle(row.title);
    const stem = row.company_stem;
    if (!titleKey || !stem) continue;
    let byTitle = index.get(stem);
    if (!byTitle) index.set(stem, (byTitle = new Map()));
    const list = byTitle.get(titleKey);
    if (list) list.push(row);
    else byTitle.set(titleKey, [row]);
  }

  for (const { job, key, stem, title } of keyed) {
    const matches = index.get(stem)?.get(title);
    // Either we do not crawl this employer, or we crawl them but never saw
    // this exact posting. Neither is evidence of closure — our crawl of
    // that company may simply predate the posting.
    if (!matches || matches.length === 0) continue;

    // One live listing means the role is open, regardless of how many
    // stale siblings exist alongside it.
    const live = matches.find((row) => row.is_active);
    if (live) {
      verdicts.set(job.id, {
        state: "open",
        lastSeenAt: live.last_seen_at,
        matchedOn: compareCompanyKeys(key, live.company_key) === "exact" ? "exact" : "canonical",
      });
      continue;
    }

    // Every match is closed. Assert that only when the employer matched
    // exactly; a canonical match ("BMO" -> "bmocampus") is good enough to
    // confirm a role is OPEN but not to tell someone it is dead.
    const exact = matches.find((row) => compareCompanyKeys(key, row.company_key) === "exact");
    if (!exact) continue;
    verdicts.set(job.id, { state: "closed", lastSeenAt: exact.last_seen_at, matchedOn: "exact" });
  }

  return verdicts;
}

/** Single-job convenience for the detail page. */
export async function getLivenessForJob(admin: AdminDb, job: LivenessInput): Promise<LivenessVerdict> {
  const map = await getLivenessForJobs(admin, [job]);
  return map.get(job.id) ?? { state: "unknown" };
}

export type EmployerBoardStats = {
  /** Roles currently open on this employer's own careers board. */
  openRoles: number;
  /** Roles we watched close there. */
  closedRoles: number;
  platform: string | null;
};

/**
 * What we know about an EMPLOYER's own board, independent of any one posting.
 *
 * Per-job liveness needs an exact title match on both sides, and aggregator
 * titles rarely equal board titles ("SUN LIFE FINANCIAL ADVISOR - Ontario"
 * versus the board's "Advisor"), so it stays silent far more often than the
 * underlying data warrants. Measured on a real search: 14 of 59 employers
 * were crawled, but only one job matched a title exactly.
 *
 * This asks the question that DOES have an answer for all 14: we poll this
 * company's own careers board, and right now it lists N open roles. No job
 * board can say that about its own listings, because none of them watch the
 * employer directly -- and unlike the per-job verdict it needs no title
 * match, so it works for every employer we crawl.
 */
export async function getEmployerBoardStats(
  admin: AdminDb,
  company: string | null | undefined,
): Promise<EmployerBoardStats | null> {
  const stem = canonicalCompanyKey(toCompanyKey(company ?? ""));
  if (!stem) return null;

  const { data, error } = await admin.database
    .from("discovered_postings")
    .select("is_active,ats_platform")
    .in("company_stem", [stem]);
  if (error) {
    console.error("[postingLiveness] employer board stats failed", error.message);
    return null;
  }

  const rows = (data ?? []) as { is_active: boolean; ats_platform: string | null }[];
  if (rows.length === 0) return null;

  return {
    openRoles: rows.filter((r) => r.is_active).length,
    closedRoles: rows.filter((r) => !r.is_active).length,
    platform: rows.find((r) => r.ats_platform)?.ats_platform ?? null,
  };
}
