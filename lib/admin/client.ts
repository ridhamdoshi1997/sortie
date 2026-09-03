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
