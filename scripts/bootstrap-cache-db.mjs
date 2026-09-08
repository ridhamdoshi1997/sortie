// Bootstrap a second Supabase project as the crawl cache.
//
// Why this exists: lib/admin/client.ts's createCacheDbClient() was written to
// put discovered_postings in its OWN project, and documents exactly why. But
// CACHE_SUPABASE_URL was never set, so it silently fell back to the main
// database -- which is how a 443 MB posting cache ended up sharing a 500 MB
// free tier with user data, and how crawl writes ended up competing with user
// searches for one small instance's IO. A bulk UPDATE on 2026-09-08 exhausted
// that shared IO budget and took search down for hours.
//
// Reads the live schema from the main database rather than replaying the 27
// migrations that mention discovered_postings: several of those also touch
// ats_registry and jobs, which stay in the MAIN project, so replaying them
// would drag user-side tables into the cache. What is live is the truth.
//
// Usage:
//   doppler run -- node scripts/bootstrap-cache-db.mjs --check
//   doppler run -- node scripts/bootstrap-cache-db.mjs --schema
//   doppler run -- node scripts/bootstrap-cache-db.mjs --copy
//
// Needs CACHE_TARGET_DB_URL (the new project's direct Postgres URL) alongside
// the existing SUPABASE_DB_URL. Idempotent: re-running --schema is safe.

import pg from "pg";

const SOURCE = process.env.SUPABASE_DB_URL;
const TARGET = process.env.CACHE_TARGET_DB_URL;

// Cache-side only. ats_registry deliberately stays in the main project: it is
// crawl INPUT (which companies to visit), it is small, and the crawl already
// takes a separate admin client for it -- see crawlKnownAtsCompanies(admin, cacheDb).
const CACHE_TABLES = ["discovered_postings", "metro_areas", "occupation_titles"];

const mode = process.argv[2] ?? "--check";

function client(url, label) {
    if (!url) throw new Error(`${label} is not set`);
    return new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 60_000 });
}

async function check() {
    for (const [label, url] of [["source", SOURCE], ["target", TARGET]]) {
        if (!url) { console.log(`${label}: NOT SET`); continue; }
        const c = client(url, label);
        const t = Date.now();
        try {
            await c.connect();
            await c.query("SET statement_timeout='30s'");
            await c.query("select 1");
            const r = await c.query(`select pg_size_pretty(pg_database_size(current_database())) db`);
            const tables = await c.query(
                `select table_name from information_schema.tables where table_schema='public' order by 1`);
            console.log(`${label}: OK ${Date.now() - t}ms, size ${r.rows[0].db}, tables: ${tables.rows.map(x => x.table_name).join(", ") || "(none)"}`);
        } catch (e) {
            console.log(`${label}: FAILED ${Date.now() - t}ms ${e.code ?? ""} ${(e.message ?? "").slice(0, 100)}`);
        } finally { try { await c.end(); } catch {} }
    }
}

// Emits the DDL to stdout rather than applying it, so it can be read before it
// is run against a real database.
async function schema() {
    const c = client(SOURCE, "SUPABASE_DB_URL");
    await c.connect();
    await c.query("SET statement_timeout='120s'");

    console.log("create extension if not exists pg_trgm;");
    console.log("create extension if not exists unaccent;");

    for (const table of CACHE_TABLES) {
        const cols = await c.query(
            `select column_name, data_type, is_nullable, column_default,
                    character_maximum_length
             from information_schema.columns
             where table_schema='public' and table_name=$1 order by ordinal_position`, [table]);
        if (!cols.rows.length) { console.log(`-- ${table}: not present in source, skipped`); continue; }
        console.log(`\n-- ${table}`);
        const defs = cols.rows.map((r) => {
            const type = r.character_maximum_length
                ? `${r.data_type}(${r.character_maximum_length})` : r.data_type;
            const nullable = r.is_nullable === "NO" ? " not null" : "";
            const dflt = r.column_default ? ` default ${r.column_default}` : "";
            return `  "${r.column_name}" ${type}${dflt}${nullable}`;
        });
        console.log(`create table if not exists public.${table} (\n${defs.join(",\n")}\n);`);

        const idx = await c.query(
            `select indexdef from pg_indexes where schemaname='public' and tablename=$1 order by indexname`, [table]);
        for (const r of idx.rows) {
            console.log(`${r.indexdef.replace(/^CREATE (UNIQUE )?INDEX /i, (m) => m + "IF NOT EXISTS ")};`);
        }
    }

    // Functions the search path calls via PostgREST .rpc(). Pulled by
    // definition so the force_custom_plan settings and bodies come across
    // exactly as they run today.
    const fns = await c.query(
        `select pg_get_functiondef(p.oid) def
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public'
           and p.proname in ('search_discovered_postings','search_postings_by_titles',
                             'mark_missing_postings_inactive','evict_discovered_postings_over_budget',
                             'prune_stale_discovered_postings','normalize_job_title',
                             'discovered_postings_title_tsv_update')
         order by p.proname`);
    for (const r of fns.rows) console.log(`\n${r.def};`);

    await c.end();
}

async function copy() {
    throw new Error(
        "--copy is not implemented yet on purpose. Run --schema first, review the DDL, " +
        "apply it to the target, and only then move rows. Copying 537k rows out of an " +
        "IO-starved source is the step most likely to make things worse, so it should be " +
        "a deliberate, separately-timed action.");
}

const run = { "--check": check, "--schema": schema, "--copy": copy }[mode];
if (!run) { console.error(`unknown mode ${mode}`); process.exit(1); }
await run();
