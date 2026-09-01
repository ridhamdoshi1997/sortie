import { createHash } from "node:crypto";

import { toCompanyKey } from "@/lib/atsRegistry";
import type { NormalizedJob } from "@/lib/jobScraper";
import type { Job } from "@/types";

// Phase 1 of the job-listing authenticity rework (2026-08-31) — see
// migrations/20260831233851_add-job-canonicalization.sql for the full
// rationale and schema. This module is the single, shared normalizer/match
// logic used by EVERY ingestion path (SerpApi, Adzuna, Apify, direct-ATS
// enrichment) — the exact bug this replaces was two DIFFERENT, weaker
// dedup keys used in different code paths, letting the same real job slip
// through as a duplicate in one path but not the other.
//
// Deliberately conservative on title normalization: only case/punctuation,
// never stripping seniority words ("Senior", "Lead", "Jr") the way some
// job-aggregation guides suggest — a "Software Engineer" and a "Senior
// Software Engineer" at the same company can be two genuinely different
// real openings, not the same one scraped twice. Merging those would be a
// worse bug than the one this fixes.
function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeLocation(location: string | null | undefined): string {
  return (location ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Reuses lib/atsRegistry.ts's own company normalizer rather than writing a
// second, slightly-different one — that divergence (title+company-only,
// differently normalized, in the old enrichWithDirectAtsJobs dedup) is
// exactly the inconsistency bug this whole module exists to close.
export function normalizeCompany(company: string | null | undefined): string {
  return toCompanyKey(company ?? "");
}

export function buildCanonicalKey(
  company: string | null | undefined,
  title: string | null | undefined,
  location: string | null | undefined,
): string {
  return `${normalizeCompany(company)}|${normalizeTitle(title)}|${normalizeLocation(location)}`;
}

// Tier-3 fallback signal (see merge_job_source's own comment): catches the
// same real posting mirrored verbatim across two boards with a
// differently-worded title, where the canonical_key fingerprint alone
// would miss it. Deliberately simple (whitespace-collapsed hash, not a
// similarity/trigram match) — a real refinement (pg_trgm fuzzy matching)
// is a later, separate phase, not required to fix the two bugs this phase
// targets.
export function computeDescriptionHash(description: string | null | undefined): string | null {
  const normalized = (description ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized.length < 50) return null; // too short to be a meaningful signal, real risk of false positives
  return createHash("sha1").update(normalized).digest("hex");
}

// Direct ATS boards are ground truth (one hop from the employer itself) —
// always outrank every aggregator. Aggregators are ranked amongst
// themselves only for tie-breaking bookkeeping; in practice they rarely
// differ enough to matter. Unknown source types default to the lowest
// tier rather than throwing, since a new provider should never crash a
// live search.
//
// Matched case-insensitively via substring, not exact equality — the real
// `source` values NormalizedJob carries are human-readable display strings
// set by each provider (lib/jobScraper.ts: "SerpApi", "TheirStack",
// "Adzuna", "Indeed (via Apify)"), not machine tokens. The ATS platform
// names from lib/atsProviders.ts ("greenhouse", "lever", "ashby",
// "smartrecruiters", "workday", "icims") are already lowercase and match
// via the same substring check.
const ATS_PLATFORMS = new Set(["greenhouse", "lever", "ashby", "workday", "smartrecruiters", "icims"]);
export function sourcePriority(sourceType: string): number {
  const normalized = sourceType.toLowerCase();
  if (ATS_PLATFORMS.has(normalized)) return 100;
  if (normalized === "employer") return 90;
  if (normalized.includes("serpapi") || normalized.includes("adzuna") || normalized.includes("theirstack")) return 50;
  if (normalized.includes("apify")) return 40;
  return 10;
}

// Real production bug found live (2026-09-01, direct user report — a
// search that should have found 33 distinct real jobs collapsed to just
// 5): SerpApi's own `detected_extensions.posted_at` field is a human-
// readable RELATIVE string ("7 days ago", "25 days ago", "Just posted"),
// not a timestamp — passing it straight through to merge_job_source's
// `p_posted_at` (a real `timestamptz` column) failed Postgres's own type
// parser for every job whose posting used this format, which merge_
// job_source's catch-and-return-null treated as a silent per-job failure,
// not a hard error — 28 of 33 real, distinct jobs were dropped this way,
// not merged/deduped as the "collision" log line misleadingly suggested.
// Adzuna/TheirStack/Apify already provide real ISO timestamps, so this
// only ever fires for SerpApi — but it's applied to every source here
// (the one shared canonicalization entry point) rather than fixed
// per-provider in jobScraper.ts, so a future provider with the same
// relative-string quirk doesn't reintroduce this exact bug.
function parsePostedAt(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();

  const relative = raw.trim().toLowerCase();
  if (/^(just posted|today|posted today)$/.test(relative)) return new Date().toISOString();

  const match = relative.match(/^(\d+)\+?\s*(minute|hour|day|week|month)s?\s+ago$/);
  if (match) {
    const amount = Number(match[1]);
    const unitMs: Record<string, number> = {
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_592_000_000, // 30 days — approximate, matches this field's own "30+ days ago" imprecision
    };
    return new Date(Date.now() - amount * unitMs[match[2]]).toISOString();
  }

  // Never invent a date for a shape this doesn't recognize — extraction,
  // not guessing, same rule the AI evaluator's own field extraction
  // follows elsewhere in this codebase. null is a safe, honest value here
  // (posted_at is nullable), unlike silently dropping the whole job the
  // way an unhandled Postgres type error did.
  return null;
}

export type CanonicalizeParams = {
  userId: string;
  runId: string | null;
  sourceType: string;
  job: NormalizedJob;
};

// Structurally typed rather than importing the SDK's own client type —
// same reasoning as lib/atsRegistry.ts's AdminDb: every caller already has
// an admin client, this just avoids a runtime SDK import.
type AdminDb = {
  database: {
    // PromiseLike, not Promise — the real SDK's rpc() returns a
    // PostgrestFilterBuilder (thenable, awaitable) rather than a literal
    // Promise, so it doesn't structurally implement catch/finally/
    // Symbol.toStringTag. PromiseLike only requires .then(), which it has.
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
};

// The one call site every ingestion path now goes through. Appends the raw
// scrape to job_sources and atomically merges it into the canonical jobs
// row via merge_job_source (see that function's own comment for why this
// has to be one atomic DB call, not app-level SELECT-then-INSERT/UPDATE —
// concurrent hits on the same real job, e.g. an ATS-enrichment result and
// a SerpApi result for the same posting landing in the same search, would
// otherwise race into creating two rows).
export type CanonicalizeResult = { status: "merged"; job: Job } | { status: "error"; message: string; title: string | null };

export async function canonicalizeJobSource(
  admin: AdminDb,
  { userId, runId, sourceType, job }: CanonicalizeParams,
): Promise<CanonicalizeResult> {
  const canonicalKey = buildCanonicalKey(job.company, job.title, job.location);
  const descriptionHash = computeDescriptionHash(job.description);

  const { data, error } = await admin.database.rpc("merge_job_source", {
    p_user_id: userId,
    p_run_id: runId,
    p_source_type: sourceType,
    p_source_priority: sourcePriority(sourceType),
    p_canonical_key: canonicalKey,
    p_description_hash: descriptionHash,
    p_source_job_id: job.id ?? null,
    p_raw_payload: job as unknown as Record<string, unknown>,
    p_title: job.title ?? null,
    p_company: job.company ?? null,
    p_location: job.location ?? null,
    p_description: job.description ?? null,
    p_salary: job.salary ?? null,
    p_salary_min: null,
    p_salary_max: null,
    p_job_type: job.type ?? null,
    p_url: job.url ?? null,
    p_source: job.source ?? sourceType,
    p_external_id: job.id ?? null,
    p_external_apply_url: job.applyUrl ?? null,
    p_raw_apply_options: job.rawApplyOptions ?? null,
    p_posted_at: parsePostedAt(job.postedAt),
    p_company_logo_url: job.logoUrl ?? null,
  });

  if (error) {
    return { status: "error", message: error.message, title: job.title ?? null };
  }
  return { status: "merged", job: data as Job };
}

// Runs a batch of raw scrape hits through canonicalization and returns the
// resulting canonical rows, deduplicated by id (several raw hits in the
// same batch commonly resolve to the same canonical job — that collapse
// count IS the collision-rate signal worth watching; logged here rather
// than wired into a metrics backend, matching this phase's deliberately
// light-touch instrumentation).
//
// Real production bug found live (2026-09-01): a hard RPC error (the
// parsePostedAt bug above, before it was fixed) used to be logged
// per-job and then silently folded into the SAME "collision" count as a
// genuine, correct dedup merge — a search that should have found 33
// distinct real jobs collapsed to 5, and the log line ("28 collisions")
// read as if dedup was just doing its job, not as the data-loss bug it
// actually was. Failures and real collisions are now counted and logged
// separately so this class of bug is never silently mistaken for normal
// merging again.
export async function canonicalizeJobSources(
  admin: AdminDb,
  userId: string,
  runId: string | null,
  jobsBySourceType: { sourceType: string; job: NormalizedJob }[],
): Promise<Job[]> {
  const results = await Promise.all(
    jobsBySourceType.map(({ sourceType, job }) => canonicalizeJobSource(admin, { userId, runId, sourceType, job })),
  );

  const byId = new Map<string, Job>();
  const failures: { title: string | null; message: string }[] = [];
  for (const result of results) {
    if (result.status === "merged") byId.set(result.job.id, result.job);
    else failures.push({ title: result.title, message: result.message });
  }

  if (failures.length > 0) {
    console.error(
      `[jobCanonicalization] ${failures.length}/${jobsBySourceType.length} raw hits FAILED to canonicalize (real errors, jobs dropped, not deduped):`,
      failures.slice(0, 5).map((f) => `"${f.title}": ${f.message}`),
    );
  }

  const realCollisions = jobsBySourceType.length - failures.length - byId.size;
  if (realCollisions > 0) {
    console.log(
      `[jobCanonicalization] ${jobsBySourceType.length} raw hits merged into ${byId.size} canonical jobs (${realCollisions} genuine dedup collision(s), ${failures.length} error(s))`,
    );
  }

  return Array.from(byId.values());
}
