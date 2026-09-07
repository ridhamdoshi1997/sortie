// One-off: resolve logo domains for the companies with the MOST cached
// postings first -- the employers actually visible in search results. Runs over
// a direct pg connection so the ordering query is not subject to PostgREST's
// 8s statement timeout. The hourly cron covers the long tail.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(`SET statement_timeout='0'`);
const { rows } = await c.query(`
  SELECT r.company_key, r.company_name, counts.postings
  FROM public.ats_registry r
  JOIN (SELECT company_key, count(*) postings FROM public.discovered_postings
        WHERE is_active GROUP BY company_key) counts ON counts.company_key = r.company_key
  WHERE r.company_domain IS NULL
  ORDER BY counts.postings DESC
  LIMIT 800`);
console.log(`resolving ${rows.length} highest-volume companies`);

const { resolveCompanyDomain } = await import("./lib/companyDomain.ts");
let hit = 0;
for (const [i, row] of rows.entries()) {
  const domain = await resolveCompanyDomain(row.company_name);
  if (domain) {
    await c.query(`UPDATE public.ats_registry SET company_domain=$1 WHERE company_key=$2`, [domain, row.company_key]);
    hit++;
  }
  if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${rows.length}, resolved ${hit}`);
  await new Promise(r => setTimeout(r, 120));
}
console.log(`DONE: resolved ${hit}/${rows.length}`);
await c.end();
