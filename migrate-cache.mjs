import pg from "pg";
const src = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const dst = new pg.Client({ connectionString: process.env.CACHE_SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await src.connect(); await dst.connect();
await src.query(`SET statement_timeout='0'`); await dst.query(`SET statement_timeout='0'`);

const SECONDARY = [
  ["discovered_postings_platform_company_external_uidx", `CREATE UNIQUE INDEX discovered_postings_platform_company_external_uidx ON public.discovered_postings USING btree (ats_platform, company_key, external_id)`],
  ["discovered_postings_title_tsv_idx", `CREATE INDEX discovered_postings_title_tsv_idx ON public.discovered_postings USING gin (title_tsv)`],
  ["discovered_postings_is_active_idx", `CREATE INDEX discovered_postings_is_active_idx ON public.discovered_postings USING btree (is_active) WHERE (is_active = true)`],
  ["discovered_postings_location_trgm_idx", `CREATE INDEX discovered_postings_location_trgm_idx ON public.discovered_postings USING gin (location gin_trgm_ops) WHERE is_active`],
  ["discovered_postings_company_key_idx", `CREATE INDEX discovered_postings_company_key_idx ON public.discovered_postings USING btree (company_key)`],
  ["discovered_postings_company_stem_idx", `CREATE INDEX discovered_postings_company_stem_idx ON public.discovered_postings USING btree (company_stem)`],
];

const already = (await dst.query(`select count(*)::int n from public.discovered_postings`)).rows[0].n;
if (already === 0) {
  for (const [name] of SECONDARY) await dst.query(`DROP INDEX IF EXISTS public.${name}`);
  console.log("dropped secondary indexes for bulk load");
}

// title_tsv is deliberately NOT copied: the destination trigger recomputes it
// from title on insert, identically, and it is 46 MB of wire traffic.
const COLS = ["id","ats_platform","company_key","company_name","external_id","title","location",
              "salary","job_type","apply_url","posted_at","first_seen_at","last_seen_at","is_active","company_stem"];
const BATCH = 2000;
let after = (await dst.query(`select coalesce(max(id::text),'') m from public.discovered_postings`)).rows[0].m;
let copied = already, t0 = Date.now();

for (;;) {
  const { rows } = await src.query(
    `select ${COLS.join(",")} from public.discovered_postings ${after ? "where id > $2" : ""} order by id limit $1`,
    after ? [BATCH, after] : [BATCH]);
  if (rows.length === 0) break;
  const params = [], chunks = [];
  rows.forEach((r, i) => {
    chunks.push(`(${COLS.map((_, j) => `$${i * COLS.length + j + 1}`).join(",")})`);
    COLS.forEach(cn => params.push(r[cn]));
  });
  await dst.query(
    `insert into public.discovered_postings (${COLS.join(",")}) values ${chunks.join(",")} on conflict (id) do nothing`,
    params);
  copied += rows.length;
  after = rows[rows.length - 1].id;
  if (copied % 50000 < BATCH) console.log(`  ${copied} rows, ${Math.round((Date.now()-t0)/1000)}s`);
}
console.log(`COPY DONE: ${copied} rows in ${Math.round((Date.now()-t0)/1000)}s`);

for (const [name, ddl] of SECONDARY) {
  const t = Date.now();
  await dst.query(ddl.replace("CREATE ", "CREATE ").replace(" INDEX ", " INDEX IF NOT EXISTS "));
  console.log(`  rebuilt ${name} in ${Math.round((Date.now()-t)/1000)}s`);
}
await dst.query(`ANALYZE public.discovered_postings`);
const n = await dst.query(`select count(*)::int n, count(title_tsv)::int tsv from public.discovered_postings`);
console.log("destination rows:", n.rows[0]);
await src.end(); await dst.end();
