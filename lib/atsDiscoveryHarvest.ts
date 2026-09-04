import { toCompanyKey } from "@/lib/atsRegistry";
import { canonicalCompanyKey } from "@/lib/companyIdentity";

// Turn a PAID search result into a PERMANENT FREE one.
//
// Every LinkedIn/Indeed search tells us which employers are hiring, and
// until now we took the jobs and threw the employer away — so the next
// search paid again for the same company. This records the employer in
// ats_registry instead, after which lib/proactiveAtsCrawl.ts polls their
// own careers board forever, at no cost and with a direct apply link.
//
// The cost shape changes from "per job, forever" to "once per company".
//
// Indeed makes this unusually cheap: its `urls.external` already points at
// the employer's own ATS (verified live — 50 of 53 results resolved to a
// company ATS host rather than an indeed.com redirect). When that URL names
// a platform we support, we can register the employer AS RESOLVED and skip
// ATS discovery entirely. Otherwise we store the domain and let the
// existing discovery pass work it out.
//
// Checks membership by STEM, not raw key. A raw-key check answers wrongly:
// the registry holds bmocampus/cibccampus/tdbank while aggregators say BMO,
// CIBC, TD, so it would re-add employers we already have and fragment the
// registry further — the exact problem lib/companyIdentity.ts exists to fix.

type AdminDb = {
  database: {
    from: (table: string) => {
      select: (cols: string) => {
        in: (col: string, vals: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
      upsert: (
        rows: Record<string, unknown>[],
        opts: { onConflict: string; ignoreDuplicates?: boolean },
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export type HarvestInput = { company?: string | null; applyUrl?: string | null; url?: string | null };

export type HarvestResult = {
  seen: number;
  alreadyKnown: number;
  registeredResolved: number;
  registeredForDiscovery: number;
  skippedNoSignal: number;
};

// Only the platforms whose tenant is unambiguously the first path segment.
// Workday and iCIMS are deliberately absent: their connection details are a
// tenant + board + locale tuple, and guessing that from a URL would write a
// broken config that the crawler then retries forever. Those fall through
// to domain-based discovery, which resolves them properly.
const SLUG_PLATFORMS: { test: (host: string) => boolean; platform: string }[] = [
  { test: (h) => h === "boards.greenhouse.io" || h === "job-boards.greenhouse.io", platform: "greenhouse" },
  { test: (h) => h === "jobs.lever.co", platform: "lever" },
  { test: (h) => h === "jobs.ashbyhq.com", platform: "ashby" },
  { test: (h) => h === "careers.smartrecruiters.com", platform: "smartrecruiters" },
];

export function parseAtsFromApplyUrl(rawUrl: string | null | undefined): { platform: string; slug: string } | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);
  const slug = segments[0];
  if (!slug) return null;
  for (const entry of SLUG_PLATFORMS) {
    if (entry.test(host)) return { platform: entry.platform, slug };
  }
  return null;
}

/** The employer's own domain, or null for an aggregator/ATS-vendor host. */
export function employerDomainFromUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  // A vendor host identifies the ATS, not the employer, so it is useless as
  // a discovery seed — discovery works by reading a company's OWN careers
  // page. Aggregator hosts are likewise not the employer.
  const notEmployer = [
    "greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com", "myworkdayjobs.com",
    "icims.com", "workable.com", "bamboohr.com", "dayforcehcm.com", "taleo.net", "recruitee.com",
    "breezy.hr", "linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "adzuna.com",
  ];
  if (notEmployer.some((d) => host === d || host.endsWith(`.${d}`))) return null;
  return host;
}

export async function harvestEmployers(admin: AdminDb, jobs: HarvestInput[]): Promise<HarvestResult> {
  const result: HarvestResult = {
    seen: 0,
    alreadyKnown: 0,
    registeredResolved: 0,
    registeredForDiscovery: 0,
    skippedNoSignal: 0,
  };

  // One candidate per employer, preferring whichever of its jobs carried the
  // most useful link (a parseable ATS URL beats a bare employer domain).
  const candidates = new Map<
    string,
    { key: string; stem: string; name: string; domain: string | null; ats: { platform: string; slug: string } | null }
  >();
  for (const job of jobs) {
    const name = (job.company ?? "").trim();
    const key = toCompanyKey(name);
    const stem = canonicalCompanyKey(key);
    if (!key || !stem) continue;
    const link = job.applyUrl || job.url || null;
    const ats = parseAtsFromApplyUrl(link);
    const domain = employerDomainFromUrl(link);
    const existing = candidates.get(stem);
    if (!existing) {
      candidates.set(stem, { key, stem, name, domain, ats });
    } else {
      if (!existing.ats && ats) existing.ats = ats;
      if (!existing.domain && domain) existing.domain = domain;
    }
  }
  result.seen = candidates.size;
  if (candidates.size === 0) return result;

  const stems = [...candidates.keys()];
  const { data, error } = await admin.database.from("ats_registry").select("company_stem").in("company_stem", stems);
  if (error) {
    console.error("[atsDiscoveryHarvest] registry lookup failed", error.message);
    return result;
  }
  const known = new Set(((data ?? []) as { company_stem: string | null }[]).map((r) => r.company_stem).filter(Boolean));

  const rows: Record<string, unknown>[] = [];
  for (const candidate of candidates.values()) {
    if (known.has(candidate.stem)) {
      result.alreadyKnown++;
      continue;
    }
    // Nothing to act on: no ATS link to register and no employer domain for
    // discovery to read. Registering the name alone would create a row the
    // crawler can never resolve, which just accumulates failed attempts.
    if (!candidate.ats && !candidate.domain) {
      result.skippedNoSignal++;
      continue;
    }
    rows.push({
      company_key: candidate.key,
      company_stem: candidate.stem,
      company_name: candidate.name,
      company_domain: candidate.domain,
      platform: candidate.ats?.platform ?? null,
      config: candidate.ats ? { slug: candidate.ats.slug } : null,
    });
    if (candidate.ats) result.registeredResolved++;
    else result.registeredForDiscovery++;
  }

  if (rows.length > 0) {
    // ignoreDuplicates: company_key is UNIQUE, and a concurrent search may
    // have inserted the same employer a moment ago. Losing that race is a
    // non-event, not an error worth failing a search over.
    const { error: writeError } = await admin.database
      .from("ats_registry")
      .upsert(rows, { onConflict: "company_key", ignoreDuplicates: true });
    if (writeError) {
      console.error("[atsDiscoveryHarvest] registry write failed", writeError.message);
      return { ...result, registeredResolved: 0, registeredForDiscovery: 0 };
    }
  }

  return result;
}
