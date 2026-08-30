import { createAdminDbClient } from "@/lib/admin/client";
import { slugify } from "@/lib/interviewSeo";

// Programmatic SEO pages built on real, employer-posted salary ranges
// (jobs.salary — free text from the original posting, aggregated across
// many real postings). Deliberately NOT built on jobs.company_research:
// that JSONB is written per-candidate from their own resume (leaks real
// work history) and "company" there is often the job board/staffing
// agency, not the real employer — verified live on 2026-08-30 before
// building this instead. Salary text carries no such risk: it's what the
// employer publicly posted, never user-generated or personal.
//
// jobs.salary_min/salary_max exist in the schema but are unpopulated for
// every real row (verified live) — this file parses the free-text
// jobs.salary field itself rather than relying on them.

const MIN_SAMPLE_SIZE = 5;
const MIN_PLAUSIBLE_ANNUAL = 20_000;
const MAX_PLAUSIBLE_ANNUAL = 600_000;
const HOURS_PER_YEAR = 2080; // 40hr/week * 52 weeks — disclosed on the page, not hidden

export type SalaryInsight = {
  slug: string;
  roleFamily: string;
  location: string;
  currency: string;
  sampleSize: number;
  typicalLow: number;
  typicalHigh: number;
  observedLow: number;
  observedHigh: number;
  mostRecentPosting: string;
};

// Ordered most-specific-first so e.g. "Senior Data Engineer" lands in Data
// Engineer, not the generic Software Engineer catch-all below it.
const ROLE_FAMILIES: { label: string; pattern: RegExp }[] = [
  { label: "DevOps / Site Reliability Engineer", pattern: /devops|site reliability|\bsre\b/i },
  { label: "Data Engineer", pattern: /data engineer/i },
  { label: "Data Scientist / Analyst", pattern: /data scientist|data analyst/i },
  { label: "Product Manager", pattern: /product manager/i },
  { label: "QA Engineer", pattern: /\bqa\b.*(engineer|developer|analyst|tester)|quality assurance|software test/i },
  { label: "Designer", pattern: /\b(ui|ux|product) designer\b|\bdesigner\b/i },
  // Broad catch-all, checked last — real titles are messy ("Software Dev
  // Eng V", "Sr. iOS Developer", "Senior ABAP Developer") and rarely say
  // "software engineer"/"software developer" verbatim. Anything containing
  // "engineer"/"developer"/"programmer" that didn't match a more specific
  // family above lands here. A coarse heuristic, not a taxonomy classifier
  // — same tradeoff lib/interviewQuestions.ts's normalizeRoleFamily makes.
  { label: "Software Engineer", pattern: /engineer|developer|programmer|\bswe\b|\bsde\b/i },
];

function canonicalRoleFamily(title: string): string | null {
  for (const family of ROLE_FAMILIES) {
    if (family.pattern.test(title)) return family.label;
  }
  return null;
}

function normalizeLocation(raw: string): string {
  const stripped = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const parts = stripped
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.slice(0, 2).join(", ") || stripped;
}

type ParsedSalary = { min: number; max: number; currency: string };

// Handles the real formats seen live: "$104K–$143K a year",
// "$64.33–$78.95 an hour", "US$40–US$55 an hour", "160,000 CAD - 200,000
// CAD", "CAD 89,355 – 124,779", "$120000 (CAD)", "De CAD 60 k a CAD 80 k
// por año" (Spanish locale text from the scraper). Returns null on
// anything it can't confidently parse or that fails the sanity bounds
// below — a dropped row, not a guessed one.
function parseSalary(raw: string): ParsedSalary | null {
  const numberMatches = [...raw.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([kK])?/g)]
    .map((m) => {
      const value = parseFloat(m[1].replace(/,/g, ""));
      return m[2] ? value * 1000 : value;
    })
    .filter((n) => Number.isFinite(n) && n > 0);

  if (numberMatches.length === 0) return null;

  const min = Math.min(...numberMatches);
  const max = Math.max(...numberMatches);

  const isHourly = /\bhour(s|ly)?\b|\/\s*hr\b|\bhora\b/i.test(raw);
  const annualMin = isHourly ? min * HOURS_PER_YEAR : min;
  const annualMax = isHourly ? max * HOURS_PER_YEAR : max;

  if (annualMin < MIN_PLAUSIBLE_ANNUAL || annualMax > MAX_PLAUSIBLE_ANNUAL || annualMin > annualMax) return null;

  const currency = /US\$|USD/i.test(raw) ? "USD" : "CAD";

  return { min: annualMin, max: annualMax, currency };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function fetchAllInsights(): Promise<SalaryInsight[]> {
  const client = createAdminDbClient();
  const { data } = await client.database
    .from("jobs")
    .select("title,location,salary,external_id,found_at")
    .not("salary", "is", null)
    .neq("salary", "")
    .returns<{ title: string; location: string | null; salary: string; external_id: string | null; found_at: string | null }[]>();

  const rows = data ?? [];

  // Dedupe by external_id — the same real posting can otherwise be counted
  // twice (re-discovered across scraper runs), which would inflate the
  // sample size shown on the page beyond what's actually real.
  const seenExternalIds = new Set<string>();
  const buckets = new Map<
    string,
    { roleFamily: string; location: string; currency: string; parsed: ParsedSalary[]; mostRecent: string }
  >();

  for (const row of rows) {
    if (row.external_id) {
      if (seenExternalIds.has(row.external_id)) continue;
      seenExternalIds.add(row.external_id);
    }

    const roleFamily = canonicalRoleFamily(row.title);
    if (!roleFamily || !row.location) continue;

    const parsed = parseSalary(row.salary);
    if (!parsed) continue;

    const location = normalizeLocation(row.location);
    const key = `${roleFamily}::${location}::${parsed.currency}`;
    const bucket = buckets.get(key) ?? { roleFamily, location, currency: parsed.currency, parsed: [], mostRecent: "" };
    bucket.parsed.push(parsed);
    if (row.found_at && row.found_at > bucket.mostRecent) bucket.mostRecent = row.found_at;
    buckets.set(key, bucket);
  }

  return Array.from(buckets.values())
    .filter((b) => b.parsed.length >= MIN_SAMPLE_SIZE)
    .map((b) => ({
      slug: `${slugify(b.roleFamily)}--${slugify(b.location)}`,
      roleFamily: b.roleFamily,
      location: b.location,
      currency: b.currency,
      sampleSize: b.parsed.length,
      typicalLow: Math.round(median(b.parsed.map((p) => p.min)) / 1000) * 1000,
      typicalHigh: Math.round(median(b.parsed.map((p) => p.max)) / 1000) * 1000,
      observedLow: Math.round(Math.min(...b.parsed.map((p) => p.min)) / 1000) * 1000,
      observedHigh: Math.round(Math.max(...b.parsed.map((p) => p.max)) / 1000) * 1000,
      mostRecentPosting: b.mostRecent,
    }))
    .sort((a, b) => b.sampleSize - a.sampleSize);
}

export async function listSalaryInsights(): Promise<SalaryInsight[]> {
  return fetchAllInsights();
}

export async function getSalaryInsightBySlug(slug: string): Promise<SalaryInsight | null> {
  const all = await fetchAllInsights();
  return all.find((entry) => entry.slug === slug) ?? null;
}
