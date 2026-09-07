import pg from "pg";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(`SET statement_timeout='0'`);
let done = 0;
for (;;) {
  const r = await c.query(`UPDATE public.discovered_postings SET normalized_title_head = public.job_title_head(normalized_title)
    WHERE ctid IN (SELECT ctid FROM public.discovered_postings
                   WHERE normalized_title_head IS NULL AND normalized_title IS NOT NULL LIMIT 50000)`);
  if (r.rowCount === 0) break;
  done += r.rowCount;
  console.log(`  ${done}...`);
}
await c.query(`ANALYZE public.discovered_postings`);
const chk = await c.query(`select count(*) filter (where normalized_title_head is null)::int missing, count(*)::int total from public.discovered_postings`);
console.log("backfill complete:", chk.rows[0]);
await c.end();
