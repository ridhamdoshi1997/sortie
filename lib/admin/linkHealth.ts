import { createAdminDbClient, createCacheDbClient } from "@/lib/admin/client";
import { classifyApplyHost } from "@/lib/applyLinkTrust";
import { looksLikeSpecificJobPosting } from "@/lib/reresolveApplyLink";

// Link Health, extended to the table that actually matters (Phase 52,
// section 7).
//
// The original report scanned `jobs` only — the small per-user slice
// created by real searches — while `discovered_postings`, the ~810k-row
// crawl cache that is now the primary source users search, went entirely
// unmeasured. So the page reported on a derived sample and called it apply
// link health.
//
// The two are reported SEPARATELY and never summed. They measure different
// populations, and blending them would let a healthy 800-row table hide a
// sick 800,000-row one.

export type LinkHealthBucket = "direct" | "board" | "generic" | "mirror" | "unknown";
export type LinkHealthSource = "jobs" | "discovered_postings";

export type SourceReport = {
  source: LinkHealthSource;
  label: string;
  /** Rows in the population. For the cache this is the full table count. */
  total: number;
  /** Rows actually classified. Equals total for `jobs`; a sample for the cache. */
  sampleSize: number;
  sampled: boolean;
  counts: Record<LinkHealthBucket, number>;
  worst: { id: string; company: string | null; title: string | null; url: string; bucket: LinkHealthBucket }[];
  note: string;
};

export type LinkHealthTrendPoint = {
  day: string;
  source: LinkHealthSource;
  directPct: number;
  mirrorPct: number;
  sampleSize: number;
};

export type LinkHealthFullReport = {
  sources: SourceReport[];
  trend: LinkHealthTrendPoint[];
  trendIsEmpty: boolean;
};

// Sampled rather than exhaustive, deliberately. ~715,000 rows at PostgREST's
// 1000-row page cap is 715 round trips — far past what a page render can
// spend, and the eviction/prune crons mean the population shifts under a long
// scan anyway.
//
// 1,000 is not an arbitrary choice, it is PostgREST's own default max-rows
// ceiling on an RPC result: asking TABLESAMPLE for more and slicing was tried
// and silently capped here regardless. At n=1,000 the margin of error is
// about ±3.1% at 95% confidence — wide enough to matter for a small bucket,
// which is why the page reports the sample size next to every percentage
// rather than presenting them as exact.
const CACHE_SAMPLE_SIZE = 1000;
const PAGE = 1000;

function emptyCounts(): Record<LinkHealthBucket, number> {
  return { direct: 0, board: 0, generic: 0, mirror: 0, unknown: 0 };
}

function bucketFor(url: string, company: string | null): LinkHealthBucket {
  const trust = classifyApplyHost(url, company);
  const specific = looksLikeSpecificJobPosting(url);
  if (trust === "ats" || (trust === "employer" && specific)) return "direct";
  if (trust === "aggregator") return "board";
  if (trust === "employer") return "generic";
  if (trust === "low_quality") return "mirror";
  return "unknown";
}

async function scanJobs(): Promise<SourceReport> {
  const db = createAdminDbClient();
  const rows: { id: string; company: string | null; title: string | null; external_apply_url: string | null }[] = [];

  // Paginated: PostgREST caps a plain select at 1000 rows, which silently
  // produced a partial (and therefore wrong) picture in an earlier
  // hand-run version of this same count.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.database
      .from("jobs")
      .select("id, company, title, external_apply_url")
      .not("external_apply_url", "is", null)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
  }

  const counts = emptyCounts();
  const worst: SourceReport["worst"] = [];
  for (const row of rows) {
    if (!row.external_apply_url) continue;
    const bucket = bucketFor(row.external_apply_url, row.company);
    counts[bucket]++;
    if ((bucket === "mirror" || bucket === "unknown" || bucket === "generic") && worst.length < 50) {
      worst.push({ id: row.id, company: row.company, title: row.title, url: row.external_apply_url, bucket });
    }
  }

  return {
    source: "jobs",
    label: "Search results (jobs)",
    total: rows.length,
    sampleSize: rows.length,
    sampled: false,
    counts,
    worst,
    note: "Every row, not a sample. These are the per-user rows created by real searches — a small derived slice, not the inventory.",
  };
}

async function scanCache(): Promise<SourceReport> {
  const db = createCacheDbClient();

  const { count } = await db.database
    .from("discovered_postings")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);
  const total = count ?? 0;

  // TABLESAMPLE via RPC, not a random .range() offset.
  //
  // The offset approach was tried first and returned ZERO rows every time: a
  // ~700,000-row offset makes Postgres walk the relation to find the start,
  // which blows the 8s statement timeout, and the error branch degraded
  // silently to an empty sample that rendered as "no rows with apply links".
  // That is the silent-discard shape this codebase has been caught by
  // repeatedly, and it is exactly why this is measured rather than assumed.
  const percent = total > 0 ? Math.min(100, (CACHE_SAMPLE_SIZE / total) * 100 * 1.3) : 100;

  const { data, error } = await db.database.rpc("sample_active_apply_urls", { p_percent: percent });
  if (error) {
    console.error("[linkHealth] cache sample failed", error.message);
  }
  const rows = ((data ?? []) as {
    external_id: string;
    company_name: string | null;
    title: string | null;
    apply_url: string | null;
  }[]).slice(0, CACHE_SAMPLE_SIZE);

  const counts = emptyCounts();
  const worst: SourceReport["worst"] = [];
  for (const row of rows) {
    if (!row.apply_url) continue;
    const bucket = bucketFor(row.apply_url, row.company_name);
    counts[bucket]++;
    if ((bucket === "mirror" || bucket === "unknown" || bucket === "generic") && worst.length < 50) {
      worst.push({
        id: row.external_id,
        company: row.company_name,
        title: row.title,
        url: row.apply_url,
        bucket,
      });
    }
  }

  return {
    source: "discovered_postings",
    label: "Crawl cache (discovered_postings)",
    total,
    sampleSize: rows.length,
    sampled: true,
    counts,
    worst,
    note:
      rows.length === 0
        ? `The sample came back empty against ${total.toLocaleString()} active postings — that is a failure to measure, not a clean result. Check the server log for a cache-sample error.`
        : `A random ${rows.length.toLocaleString()}-row TABLESAMPLE of ${total.toLocaleString()} active postings — this table is far too large to scan on a page render. Re-checking draws a fresh sample, so percentages move slightly between runs.`,
  };
}

/** Stores today's numbers so the page has something to compare against tomorrow. */
async function writeSnapshots(sources: SourceReport[]): Promise<void> {
  const admin = createAdminDbClient();
  const day = new Date().toISOString().slice(0, 10);

  // Upsert on (day, source): re-checking the same day overwrites rather than
  // accumulating, so a day that happened to be checked five times does not
  // outweigh one that was checked once.
  const payload = sources.map((s) => ({
    day,
    source: s.source,
    total: s.total,
    sample_size: s.sampleSize,
    direct: s.counts.direct,
    board: s.counts.board,
    generic: s.counts.generic,
    mirror: s.counts.mirror,
    unknown: s.counts.unknown,
    captured_at: new Date().toISOString(),
  }));

  const { error } = await admin.database.from("link_health_snapshots").upsert(payload, { onConflict: "day,source" });
  if (error) console.error("[linkHealth] snapshot write failed", error.message);
}

async function readTrend(): Promise<LinkHealthTrendPoint[]> {
  const admin = createAdminDbClient();
  const since = new Date();
  since.setDate(since.getDate() - 29);

  const { data } = await admin.database
    .from("link_health_snapshots")
    .select("day,source,sample_size,direct,mirror")
    .gte("day", since.toISOString().slice(0, 10))
    .order("day", { ascending: true });

  return ((data ?? []) as {
    day: string;
    source: LinkHealthSource;
    sample_size: number;
    direct: number;
    mirror: number;
  }[]).map((r) => ({
    day: r.day,
    source: r.source,
    directPct: r.sample_size > 0 ? (r.direct / r.sample_size) * 100 : 0,
    mirrorPct: r.sample_size > 0 ? (r.mirror / r.sample_size) * 100 : 0,
    sampleSize: r.sample_size,
  }));
}

export async function getLinkHealthFull(): Promise<LinkHealthFullReport> {
  const [jobs, cache] = await Promise.all([scanJobs(), scanCache()]);
  const sources = [cache, jobs];

  await writeSnapshots(sources);
  const trend = await readTrend();

  return { sources, trend, trendIsEmpty: trend.length <= sources.length };
}
