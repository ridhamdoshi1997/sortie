import pg from "pg";
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(`SET statement_timeout='120s'`);
const q = async (l, sql) => { const r = await c.query(sql); console.log(l.padEnd(52), r.rows[0].n); };
await q("total postings:", `select count(*)::int n from discovered_postings`);
await q("  inactive (unreachable by every query):", `select count(*)::int n from discovered_postings where not is_active`);
await q("  location looks Canadian:", `select count(*)::int n from discovered_postings where is_active and (location ~* '(canada|ontario|quebec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|toronto|montreal|vancouver|calgary|ottawa|edmonton|winnipeg|halifax|,\s*(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE)\b)')`);
await q("  genuinely remote:", `select count(*)::int n from discovered_postings where is_active and location ~* '^(remote|anywhere)'`);
await q("  empty/unknown location:", `select count(*)::int n from discovered_postings where is_active and coalesce(location,'')=''`);
const top = await c.query(`select company_name, count(*)::int n from discovered_postings
  where is_active group by 1 order by n desc limit 8`);
console.log("\nbiggest companies by cached postings:");
top.rows.forEach(r => console.log(`   ${String(r.company_name).slice(0,38).padEnd(40)} ${r.n}`));
const over = await c.query(`select count(*)::int n from (
  select company_key from discovered_postings where is_active group by 1 having count(*) > 200) x`);
console.log("\ncompanies with >200 cached postings:", over.rows[0].n);
const overRows = await c.query(`select coalesce(sum(n - 200),0)::int n from (
  select company_key, count(*)::int n from discovered_postings where is_active group by 1 having count(*) > 200) x`);
console.log("rows beyond a 200-per-company cap:", overRows.rows[0].n);
await c.end();
