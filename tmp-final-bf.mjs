import pg from "pg";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(`SET statement_timeout='0'`);
let done = 0;
for (;;) {
  const r = await c.query(`UPDATE public.discovered_postings SET normalized_title_head = public.job_title_head(normalized_title)
    WHERE ctid IN (SELECT ctid FROM public.discovered_postings
                   WHERE normalized_title_head IS NULL AND normalized_title IS NOT NULL LIMIT 20000)`);
  if (r.rowCount === 0) break;
  done += r.rowCount;
}
console.log(`cleared ${done} remaining rows`);

// Prove the trigger maintains BOTH derived columns on a fresh insert.
await c.query(`insert into public.discovered_postings (ats_platform, company_key, company_name, external_id, title, location)
  values ('__t','__t','T','__x','Senior Investment Advisor Associate, Wealth','Toronto, ON')
  on conflict (ats_platform, company_key, external_id) do update set title = excluded.title`);
const t = await c.query(`select title, normalized_title, normalized_title_head from public.discovered_postings where ats_platform='__t'`);
console.log("trigger on a new row:", t.rows[0]);
await c.query(`delete from public.discovered_postings where ats_platform='__t'`);
const f = await c.query(`select count(*) filter (where normalized_title_head is null and normalized_title is not null)::int missing from public.discovered_postings`);
console.log("rows still missing a head:", f.rows[0].missing);
await c.end();
