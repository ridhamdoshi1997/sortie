// Free ATS company registry ingest (2026-09-04).
//
// The problem this solves: ats_registry had grown to ~24,000 companies from
// two seed datasets plus reactive discovery, but a live "Financial Advisor"/
// Toronto search still drew ZERO rows from the 378,000-posting crawl cache.
// The employers hiring for that role in that city — Scotiabank, Sun Life,
// Edward Jones — were either absent, or present with platform=null because
// discovery had nothing to work from.
//
// jobhive (github.com/kalil0321/ats-scrapers, MIT) publishes a companies file
// listing **80,390 companies across 65 ATS platforms**, refreshed hourly, with
// no API key. Crucially it is a plain CSV of `ats,name,slug,url` at 3.4MB —
// so this needs no Parquet reader, no DuckDB native binary (which would be a
// real risk inside Vercel's serverless size limits), and no external storage.
//
// Deliberately ingests the REGISTRY, not jobhive's 5.1M job rows. Three
// reasons, and the distinction matters:
//   1. Size: 3.4MB against a 16.8GB full job dump that could never fit a
//      500MB Postgres.
//   2. Freshness: our own crawler then fetches each board directly, so
//      postings come from the employer live rather than from someone else's
//      snapshot (a sampled iCIMS row was already a year old).
//   3. Link quality: direct employer ATS URLs are this product's whole
//      differentiator, and crawling ourselves is what produces them.
// In other words jobhive tells us WHICH companies exist; lib/proactiveAtsCrawl
// keeps doing what it already does well — fetching their jobs.

const JOBHIVE_COMPANIES_CSV = "https://storage.stapply.ai/jobhive/v1/companies.csv";

// jobhive's `ats` values mapped onto the platform names this codebase's own
// adapters use. Only platforms lib/atsProviders.ts can actually fetch are
// listed — importing a company whose board we cannot read would just create
// rows the crawler skips forever. Everything unmapped is ignored, which is
// also how new jobhive platforms stay harmless until an adapter exists.
const JOBHIVE_ATS_TO_PLATFORM: Record<string, string> = {
  greenhouse: "greenhouse",
  lever: "lever",
  ashby: "ashby",
  smartrecruiters: "smartrecruiters",
  workable: "workable",
  bamboohr: "bamboohr",
  workday: "workday",
  icims: "icims",
  dayforce: "dayforce",
  // Added 2026-09-04 once real adapters existed. Keeping this map limited to
  // fetchable platforms is what makes a new jobhive platform harmless until
  // then -- see this map's own comment above.
  breezy: "breezy",
  recruitee: "recruitee",
  teamtailor: "teamtailor",
  join_com: "join",
};

// Same normalisation ats_registry already uses for company_key, duplicated
// here rather than imported so this module stays free of a runtime SDK
// dependency (matching lib/proactiveAtsCrawl.ts's own AdminDb posture).
function companyKey(company: string): string {
  return company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|ulc)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Minimal CSV field splitter: jobhive quotes fields containing commas, and
// company names frequently do ("Smith, Jones & Co"). A naive split(",") would
// silently corrupt those rows.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      out.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  out.push(field);
  return out;
}

// Workday's identifier is a tenant + board pair, not a single slug, so its
// config shape differs from the slug-based platforms — same split
// lib/atsProviders.ts's DiscoveredAts already makes.
const WORKDAY_URL = /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:([a-z]{2}-[A-Z]{2})\/)?([A-Za-z0-9_-]+)/i;
const ICIMS_URL = /([a-z0-9-]+)\.icims\.com/i;

type RegistryRow = { company_key: string; company_name: string; platform: string; config: Record<string, string> };

function toRegistryRow(ats: string, name: string, slug: string, url: string): RegistryRow | null {
  const platform = JOBHIVE_ATS_TO_PLATFORM[ats.toLowerCase()];
  if (!platform || !name.trim()) return null;

  const key = companyKey(name);
  if (key.length < 2) return null;

  if (platform === "workday") {
    const match = url.match(WORKDAY_URL);
    if (!match) return null;
    const [, tenant, wdInstance, locale, board] = match;
    // A generic "/Search" board is Workday's own browser route, not a real
    // board id — lib/proactiveAtsCrawl.ts already re-resolves those, so let
    // them through rather than dropping the company entirely.
    return { company_key: key, company_name: name, platform, config: { tenant, wdInstance, locale: locale ?? "en-US", board } };
  }

  if (platform === "icims") {
    const match = url.match(ICIMS_URL);
    if (!match) return null;
    return { company_key: key, company_name: name, platform, config: { tenant: match[1] } };
  }

  // Slug platforms: jobhive's own slug is the board identifier.
  const cleanSlug = slug.split("/")[0].trim();
  if (!cleanSlug) return null;
  return { company_key: key, company_name: name, platform, config: { slug: cleanSlug } };
}

type AdminDb = {
  database: {
    from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
};

const UPSERT_BATCH_SIZE = 500;

export async function ingestJobhiveRegistry(
  admin: AdminDb,
  options?: { limit?: number },
): Promise<{ parsed: number; mapped: number; upserted: number; byPlatform: Record<string, number> }> {
  const res = await fetch(JOBHIVE_COMPANIES_CSV, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`jobhive companies CSV returned HTTP ${res.status}`);
  const csv = await res.text();

  const lines = csv.split("\n");
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = {
    ats: header.indexOf("ats"),
    name: header.indexOf("name"),
    slug: header.indexOf("slug"),
    url: header.indexOf("url"),
  };
  if (Object.values(idx).some((i) => i < 0)) {
    throw new Error(`jobhive CSV header changed: ${header.join(",")}`);
  }

  // Deduped on company_key BEFORE the upsert: the file legitimately lists the
  // same employer more than once (different boards, regional entities), and
  // Postgres rejects an ON CONFLICT batch that touches one key twice — the
  // exact failure lib/proactiveAtsCrawl.ts's dedupePostingRows already exists
  // to prevent. First occurrence wins.
  const byKey = new Map<string, RegistryRow>();
  let parsed = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    parsed++;
    const cols = splitCsvLine(line);
    const row = toRegistryRow(cols[idx.ats] ?? "", cols[idx.name] ?? "", cols[idx.slug] ?? "", cols[idx.url] ?? "");
    if (row && !byKey.has(row.company_key)) byKey.set(row.company_key, row);
    if (options?.limit && byKey.size >= options.limit) break;
  }

  const rows = [...byKey.values()];
  const byPlatform: Record<string, number> = {};
  for (const row of rows) byPlatform[row.platform] = (byPlatform[row.platform] ?? 0) + 1;

  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    // ignoreDuplicates so an employer we already discovered — with a board
    // possibly resolved more precisely by our own crawler — is never
    // overwritten by this bulk seed. New companies are added; existing rows
    // are left exactly as they are.
    const { error } = await admin.database
      .from("ats_registry")
      .upsert(batch, { onConflict: "company_key", ignoreDuplicates: true });
    if (error) console.warn(`[jobhiveRegistry] upsert batch failed`, error.message);
    else upserted += batch.length;
  }

  return { parsed, mapped: rows.length, upserted, byPlatform };
}
