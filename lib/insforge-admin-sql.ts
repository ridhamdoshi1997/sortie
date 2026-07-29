// Direct raw-SQL access to the InsForge backend, for the narrow set of
// operations the SDK genuinely can't do — specifically, deleting a row from
// `auth.users`. InsForge's public REST API (confirmed live 2026-07-28
// against its own OpenAPI spec, openapi/auth.yaml) only exposes GET on
// /api/auth/users/{userId} — there is no documented endpoint to delete a
// user account. `auth.users` is a real Postgres table with no destructive
// triggers on DELETE (confirmed live: the only trigger, on_auth_user_created,
// fires on INSERT only) and clean ON DELETE CASCADE from it to
// auth.user_providers, applications, usage_daily, and rate_limit — so a
// direct SQL DELETE is safe and the correct fix, not a reason to migrate off
// InsForge over one missing admin endpoint.
//
// Endpoint reverse-engineered from @insforge/cli's own source (the same
// admin credential this project already uses in lib/inngest/functions.ts) —
// POST /api/database/advance/rawsql/unrestricted, body { query }. The
// "unrestricted" variant is required for any statement touching a schema
// other than public (e.g. auth.*) — the restricted variant is what the CLI's
// own `db query` command uses by default for ordinary public-schema access.
//
// NEVER call this with unvalidated input. Every caller must build `query`
// from server-verified values only (e.g. a user ID already confirmed via
// requireUser()), never from anything a client could influence directly.
export async function runAdminSql(query: string): Promise<{ rows: unknown[] }> {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  const apiKey = process.env.INSFORGE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("[insforge-admin-sql] Missing NEXT_PUBLIC_INSFORGE_URL or INSFORGE_API_KEY");
  }

  const res = await fetch(`${baseUrl}/api/database/advance/rawsql/unrestricted`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as { message?: string; error?: string });
    throw new Error(err.message ?? err.error ?? `Admin SQL request failed: ${res.status}`);
  }

  const raw = (await res.json()) as { rows?: unknown[]; data?: unknown[] };
  return { rows: raw.rows ?? raw.data ?? [] };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Defense in depth: every call site interpolates a user ID into raw SQL.
// The ID always originates from requireUser() (server-verified session, not
// client input), but this guard makes a malformed/unexpected value fail
// loudly instead of ever reaching a SQL string.
export function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`[insforge-admin-sql] Expected a UUID for ${label}, got: ${value}`);
  }
}
