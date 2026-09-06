import { createClient } from "@supabase/supabase-js";
// NOT from lib/insforge-server.ts — that file imports "next/headers" and
// gets bundled into client code via lib/models.ts → Navbar.tsx, which broke
// the whole app when this used to import wrapAuth from there directly. See
// lib/insforge-server.ts's own comment for the full incident.
import { wrapAuth } from "@/lib/insforge-auth-shim";

// MIGRATION SHIM (Phase 41+) — Supabase-backed, service-role key, bypasses
// RLS entirely. Every caller MUST have already passed requireAdmin()
// (lib/admin/auth.ts) first. The prevent_profiles_admin_field_change()
// trigger (see migration schema) checks current_user = 'service_role',
// which is exactly the Postgres role Supabase's service-role key executes
// queries as — this client is what that check is written to expect.
export function createAdminDbClient() {
  const client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  // No `...client` spread — see lib/insforge-server.ts's wrapClient for why
  // (it erases generic method signatures like .maybeSingle<T>()). Same
  // wrapAuth() as the regular server client so both client shapes match
  // exactly wherever a helper accepts either interchangeably.
  return { database: client, auth: wrapAuth(client), storage: client.storage };
}

// Compatibility export for the 7 files (16 call sites) that import
// createAdminClient({baseUrl, apiKey}) directly from "@insforge/sdk" —
// same argument shape kept so only the import path needs changing, not the
// call sites themselves. baseUrl/apiKey are accepted but ignored; this
// always connects to the real Supabase project regardless of what's passed.
export function createAdminClient(_config: { baseUrl: string; apiKey: string }) {
  return createAdminDbClient();
}


// The crawl cache lives in its OWN Supabase project (2026-09-06).
//
// discovered_postings had grown to 614 MB of a 672 MB database against a 500 MB
// free-plan limit, while every profile, job, application and resume together
// came to about 57 MB. Pruning bought headroom (672 -> 406 MB) but not a
// solution: 17,374 registry companies are still awaiting a first crawl, so the
// cache grows back on its own. Splitting it out gives the cache its own 500 MB
// and leaves the main project holding user data alone.
//
// A second Supabase project rather than a different engine, deliberately: the
// search this serves depends on Postgres specifics that took real measurement
// to get right -- a trigram index for the leading-wildcard location match, a
// tsvector GIN index for titles, and plan_cache_mode=force_custom_plan on
// search_discovered_postings, without which PostgREST's generic plan runs up to
// 90x slower and blows the 8s statement timeout. Rewriting that against SQLite
// FTS5 would mean re-deriving all of it.
//
// Falls back to the main project when CACHE_SUPABASE_URL is unset, so a local
// checkout without the new secrets keeps working exactly as before instead of
// failing at import time.
export function createCacheDbClient() {
  const url = process.env.CACHE_SUPABASE_URL;
  const key = process.env.CACHE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return createAdminDbClient();

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { database: client, auth: wrapAuth(client), storage: client.storage };
}
