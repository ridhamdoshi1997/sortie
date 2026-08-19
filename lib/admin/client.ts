import { createAdminClient } from "@insforge/sdk";

// Service-role client for /admin only — instantiated with the project's
// full-access API key, runs as `project_admin` on every query, bypasses
// RLS entirely (build-plan.md §R's "skip is_admin+RLS, use a service-role
// client instead" architecture). Every caller MUST have already passed
// requireAdmin() (lib/admin/auth.ts) first — this client itself has no
// awareness of who's asking.
export function createAdminDbClient() {
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}
