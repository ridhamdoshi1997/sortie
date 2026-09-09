// Bulk-resolve employer domains for every company we hold postings for.
//
// This is the fix for missing and wrong logos, and it is deliberately a BULK
// run rather than the 200-per-cron trickle it replaced. There are 38,101
// distinct companies with active postings; the old batch would have taken ~85
// hours to reach them and never covered LinkedIn or Indeed employers at all,
// because it only wrote to ats_registry. At ~200ms a lookup with modest
// concurrency this finishes in minutes.
//
// Clearbit's autocomplete endpoint: free, no key, no account. NOT
// logo.clearbit.com, which this project already found to be DNS-dead -- a
// different service that is still up, and the same one lib/companyDomain.ts
// already uses one company at a time.
//
//   doppler run -- node scripts/resolve-company-domains.mjs           # all
//   doppler run -- node scripts/resolve-company-domains.mjs 2000      # first N
//
// Resumable by construction: every attempt is recorded, including misses, so a
// re-run picks up where it stopped and never re-asks about a name Clearbit has
// already said it does not know.

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const CACHE_REF = "dbvlavcckctcqmohztxm";
const LIMIT = Number(process.argv[2]) || Infinity;

// Kept low on purpose. This is an unauthenticated public endpoint and the goal
// is to finish, not to get rate-limited halfway and leave a partial table.
const CONCURRENCY = 6;
const PAGE = 500;

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${CACHE_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(180000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 220)}`);
  return JSON.parse(text);
}

const LEGAL = /\b(inc|llc|ltd|limited|corp|corporation|company|co|group|holdings|plc|gmbh|sa|nv|ag)\b\.?/gi;
const norm = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

// Never results[0] blindly: "BDC" returns BD (bd.com) first, and "RBC" returns
// the Russian РБК ahead of the bank. A confidently wrong logo is worse than no
// logo, which is the same reason app/api/logo/route.ts refuses Google's
// always-200 favicon service.
const MIN_PREFIX = 5;
function pick(results, query) {
  if (!Array.isArray(results)) return null;
  const target = norm(query);
  if (!target) return null;
  for (const r of results) {
    if (!r?.domain || !r?.name) continue;
    const name = norm(r.name);
    if (!name) continue;
    const exact = name === target;
    const prefix =
      Math.min(name.length, target.length) >= MIN_PREFIX &&
      (name.startsWith(target) || target.startsWith(name));
    if (exact || prefix) {
      const d = r.domain.trim().toLowerCase();
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return d;
    }
  }
  return null;
}

// The crawl stores names as the board presents them, often with a business-unit
// suffix in brackets: "BMO (Campus)", "Fil (Fidelitycanada)". Searching the
// whole string finds nothing, so each candidate is tried in turn.
function candidates(raw) {
  const clean = (v) => v.replace(LEGAL, " ").replace(/\s+/g, " ").trim();
  const out = [clean(raw)];
  const m = raw.match(/^([^(]+)\(([^)]+)\)/);
  if (m) { out.push(clean(m[1])); out.push(clean(m[2])); }
  return [...new Set(out.filter((c) => c.length >= 2))];
}

async function resolve(name) {
  for (const q of candidates(name)) {
    try {
      const res = await fetch(
        `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
      );
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 2500)); continue; }
      if (!res.ok) continue;
      const hit = pick(await res.json(), q);
      if (hit) return hit;
    } catch { /* network blip: try the next candidate, never throw */ }
  }
  return null;
}

const esc = (v) => String(v).replace(/'/g, "''");

let done = 0, found = 0, missed = 0;
const started = Date.now();

while (done < LIMIT) {
  const batch = await sql(`select * from public.companies_needing_domain(${Math.min(PAGE, LIMIT - done)})`);
  if (batch.length === 0) break;

  // Fixed-size worker pool rather than Promise.all over the whole batch, so
  // concurrency stays at CONCURRENCY instead of spiking to PAGE.
  const queue = [...batch];
  const rows = [];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      const domain = await resolve(item.company_name);
      rows.push({ ...item, domain });
      if (domain) found++; else missed++;
    }
  }));

  // One statement per batch. Misses are written too -- that is what makes a
  // re-run skip names Clearbit has already declined.
  const values = rows.map((r) =>
    `('${esc(r.company_key)}','${esc(r.company_name)}',${r.domain ? `'${esc(r.domain)}'` : "NULL"})`).join(",");
  await sql(`insert into public.company_domains (company_key, company_name, domain)
             values ${values}
             on conflict (company_key) do update
               set domain = coalesce(excluded.domain, public.company_domains.domain),
                   resolved_at = now(),
                   attempts = public.company_domains.attempts + 1`);

  done += rows.length;
  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`${done} processed · ${found} resolved · ${missed} no match · ${mins} min`);
}

console.log(`\nDONE: ${found} domains for ${done} companies (${done ? Math.round((100 * found) / done) : 0}% hit rate) in ${((Date.now() - started) / 60000).toFixed(1)} min`);
