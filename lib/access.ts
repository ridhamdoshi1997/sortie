import type { createInsforgeServer } from "@/lib/insforge-server";
import type { ModelProvider } from "@/lib/models";

type Insforge = Awaited<ReturnType<typeof createInsforgeServer>>;

// Minimum-cost public launch policy (see progress-tracker.md "Phase 0").
// Zero new infra: a comma-separated env allowlist gates paid-model access
// instead of a DB role/plan column, since there is no paid tier yet.
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdminUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}

// The single point every AI call site should go through to decide which
// provider actually runs — not just setPreferredModel's write-time check.
// Guards against a stale non-Gemini value already saved on a profile
// (e.g. set before this policy existed) still being honored at generation
// time for a non-admin account.
export function resolveProvider(
  preferredModel: ModelProvider | null | undefined,
  email: string | null | undefined,
): ModelProvider {
  if (!isAdminUser(email)) return "gemini";
  return preferredModel ?? "gemini";
}

// Bounds worst-case AI/Browserbase spend during the minimum-cost public
// launch by capping total accounts. MAX_SIGNUPS unset/0 means uncapped.
// Ranks by signup order (profiles.created_at) rather than a raw row count
// so an already-onboarded user is never retroactively locked out by later
// signups pushing the total over the cap — only genuinely new accounts
// past the limit see the waitlist.
export async function isWithinSignupCap(
  insforge: Insforge,
  userId: string,
  email: string | null | undefined,
): Promise<boolean> {
  if (isAdminUser(email)) return true;

  const maxSignups = Number(process.env.MAX_SIGNUPS ?? "");
  if (!maxSignups || Number.isNaN(maxSignups)) return true;

  const { data: mine } = await insforge.database
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle<{ created_at: string }>();

  // Fail open — never block access because our own lookup failed.
  if (!mine?.created_at) return true;

  const { count } = await insforge.database
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .lte("created_at", mine.created_at);

  return (count ?? 0) <= maxSignups;
}
