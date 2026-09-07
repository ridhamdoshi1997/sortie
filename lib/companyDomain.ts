// Resolves an employer's real website domain from its NAME.
//
// This is the missing piece behind blank logos on crawl-cache jobs. Those
// postings come from ATS boards, so their apply link points at the ATS host
// (boards.greenhouse.io/acme, acme.wd3.myworkdayjobs.com) and
// extractLikelyLogoDomain correctly refuses to read an employer domain out of
// it. CompanyLogo then falls back to guessing from the company name, which
// fails for exactly the employers people search for: "Royal Bank of Canada"
// guesses royalbankofcanada.com when the real domain is rbc.com.
//
// ats_registry.company_domain was supposed to hold this, but only 17 of 68,404
// rows ever got populated -- it is only written during reactive ATS discovery,
// and the overwhelming majority of companies arrived through the jobhive CSV
// bulk import instead, whose columns are `ats,name,slug,url` where url is the
// BOARD, not the company site. So the column exists and is empty.
//
// Clearbit's autocomplete endpoint fills it: free, no API key, no account.
// Note this is NOT logo.clearbit.com, which this project already found to be
// fully DNS-dead (see app/api/logo/route.ts) -- a different service that is
// still up. Verified live against real employers from this database:
//   Royal Bank of Canada  -> rbc.com
//   Ontario Teachers ...  -> otpp.com
//   Fidelity Canada       -> fidelity.ca
//   Scotiabank            -> scotiabank.com
//   Imagine Communications-> imaginecommunications.com
//
// Resolution is deliberately a BACKGROUND concern (the crawl persists what it
// finds into ats_registry.company_domain), so it is paid once per company ever
// and never on a candidate's search path.

const CLEARBIT_AUTOCOMPLETE = "https://autocomplete.clearbit.com/v1/companies/suggest";

// Short: this runs inside a crawl batch that has its own time budget, and a
// missing logo is cosmetic. Better to give up than to slow the crawl.
const LOOKUP_TIMEOUT_MS = 5000;

type Suggestion = { name?: string; domain?: string };

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Suffixes the ATS registry carries but a company's own name usually does not,
// stripped before matching so "Acme Corp" still matches a suggestion for
// "Acme".
const LEGAL_SUFFIXES = /\b(inc|llc|ltd|limited|corp|corporation|company|co|group|holdings|plc|gmbh|sa|nv|ag)\b\.?/gi;

// Shortest name we will accept a PREFIX match on. Measured: "BDC" returns "BD"
// (bd.com) as its first suggestion, and a bare prefix rule would attach BD's
// logo to BDC. Five characters is past the initialisms where that goes wrong,
// while still allowing "Ontario Teachers" -> "Ontario Teachers' Pension Plan"
// and "Indigo Books & Music" -> "Indigo".
const MIN_PREFIX_MATCH_LENGTH = 5;

// The crawl stores names as the ATS board presents them, which often carries a
// business-unit suffix in brackets: "BMO (Campus)", "BMO (Privileged)",
// "Ghr (Lateral Canada)", "Fil (Fidelitycanada)". Searching the whole string
// finds nothing. Each candidate is tried in order until one resolves: the name
// as given, the part before the bracket, then the part inside it -- the last
// because it is sometimes the more recognisable half ("Fidelitycanada").
function queryCandidates(raw: string): string[] {
  const clean = (v: string) => v.replace(LEGAL_SUFFIXES, " ").replace(/\s+/g, " ").trim();
  const candidates = [clean(raw)];

  const bracket = raw.match(/^([^(]+)\(([^)]+)\)/);
  if (bracket) {
    candidates.push(clean(bracket[1]));
    candidates.push(clean(bracket[2]));
  }
  return [...new Set(candidates.filter((c) => c.length >= 2))];
}

function pickDomain(results: Suggestion[], query: string): string | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  const target = normalize(query);
  if (!target) return null;

  for (const r of results) {
    if (!r.domain || !r.name) continue;
    const name = normalize(r.name);
    if (!name) continue;
    const equal = name === target;
    const prefix =
      Math.min(name.length, target.length) >= MIN_PREFIX_MATCH_LENGTH &&
      (name.startsWith(target) || target.startsWith(name));
    if (equal || prefix) {
      const domain = r.domain.trim().toLowerCase();
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return domain;
    }
  }
  return null;
}

export async function resolveCompanyDomain(companyName: string | null | undefined): Promise<string | null> {
  const raw = (companyName ?? "").trim();
  if (raw.length < 2) return null;

  for (const query of queryCandidates(raw)) {
    const domain = await lookup(query);
    if (domain) return domain;
  }
  return null;
}

async function lookup(query: string): Promise<string | null> {

  let results: Suggestion[];
  try {
    const response = await fetch(`${CLEARBIT_AUTOCOMPLETE}?query=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    results = (await response.json()) as Suggestion[];
  } catch {
    // Network blip, timeout, or a rate limit. Never throws: the caller is a
    // crawl batch and this is a cosmetic enrichment.
    return null;
  }

  // Never results[0] blindly. Measured why: "BDC" returns BD (bd.com) first and
  // BDC (bdc.ca) second, and "RBC" returns the Russian РБК (rbc.ru) ahead of
  // the bank. A confidently wrong logo is worse than none -- the same reason
  // app/api/logo/route.ts refuses Google's always-200 favicon service.
  return pickDomain(results, query);
}
