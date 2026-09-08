// Reclaim index bloat on discovered_postings.
//
// Why this is a script and not a cron: REINDEX CONCURRENTLY cannot run inside a
// transaction, and every PostgREST RPC is one, so an Inngest function cannot do
// it. It needs a direct connection.
//
// Why it is needed at all (2026-09-08 incident): a bulk UPDATE rewrites every
// index entry and autovacuum does not give the dead ones back. Two full-table
// backfills over 486k rows inflated these indexes from ~101 MB to 186 MB, which
// is what pushed a 500 MB database to 524 MB and over its plan limit.
//
// CONCURRENTLY builds each replacement alongside the live index and swaps at the
// end, so the table stays readable AND writable throughout -- unlike VACUUM
// FULL, which takes an exclusive lock for the duration.
//
// Measured on the real table: 186 MB -> 101 MB, database 524 MB -> 439 MB, and
// search got FASTER rather than slower (Software Engineer 2710ms -> 1485ms,
// Marketing Manager 3314ms -> 1262ms) because a smaller index is fewer pages to
// read. Allow a minute or so; the first search after it runs is slow while the
// new indexes warm.
//
// RUN THIS AFTER ANY BULK UPDATE on discovered_postings.
//
//   doppler run -- node scripts/reindex-postings.mjs

import pg from "pg";

const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 60_000,
});

await c.connect();
// No statement timeout: a reindex on a large table legitimately takes minutes,
// and being killed halfway wastes the work without freeing anything.
await c.query("SET statement_timeout='0'");

const { rows: before } = await c.query(
    `SELECT pg_size_pretty(pg_database_size(current_database())) db`);
console.log(`database before: ${before[0].db}`);

const { rows: indexes } = await c.query(
    `SELECT indexrelname AS name FROM pg_stat_user_indexes
     WHERE relname = 'discovered_postings'
     ORDER BY pg_relation_size(indexrelid) DESC`);

for (const { name } of indexes) {
    const { rows: b } = await c.query(`SELECT pg_size_pretty(pg_relation_size($1::regclass)) sz`, [name]);
    const started = Date.now();
    try {
        await c.query(`REINDEX INDEX CONCURRENTLY public.${name}`);
        const { rows: a } = await c.query(`SELECT pg_size_pretty(pg_relation_size($1::regclass)) sz`, [name]);
        console.log(`  ${name.padEnd(46)} ${b[0].sz.padStart(9)} -> ${String(a[0].sz).padStart(9)}  (${Date.now() - started}ms)`);
    } catch (error) {
        // One index failing must not abandon the rest. A failed CONCURRENTLY
        // build can leave an INVALID index behind; it is harmless to queries but
        // should be dropped -- check with \d discovered_postings.
        console.warn(`  ${name}: FAILED ${error.code ?? ""} ${(error.message ?? "").slice(0, 90)}`);
    }
}

const { rows: after } = await c.query(
    `SELECT pg_size_pretty(pg_database_size(current_database())) db,
            pg_size_pretty(pg_indexes_size('public.discovered_postings')) idx`);
console.log(`database after:  ${after[0].db}  (indexes ${after[0].idx})`);

await c.end();
