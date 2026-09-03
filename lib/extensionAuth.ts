import { createHash } from "crypto";
import { createAdminClient } from "@/lib/admin/client";

// Shared bearer-token resolution for every /api/extension/* route — the
// browser extension has no access to this app's session cookie, so each
// request carries a personal API key (actions/apiKeys.ts) instead. Only a
// SHA-256 hash is ever stored, so resolution is a hash-and-look-up, not a
// direct comparison.
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function getAdminClient() {
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
}

export async function resolveApiKeyUser(
  admin: ReturnType<typeof getAdminClient>,
  rawKey: string,
): Promise<{ id: string; user_id: string } | null> {
  const { data } = await admin.database
    .from("user_api_keys")
    .select("id,user_id")
    .eq("key_hash", hashApiKey(rawKey))
    .maybeSingle<{ id: string; user_id: string }>();
  return data ?? null;
}

export function touchApiKeyLastUsed(admin: ReturnType<typeof getAdminClient>, id: string): void {
  // Fire-and-forget — a failed timestamp update shouldn't fail the real request.
  admin.database
    .from("user_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id)
    .then(undefined, (error: unknown) => console.error("[lib/extensionAuth] last_used_at update failed", error));
}
