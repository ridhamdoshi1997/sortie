"use server";

import { getCurrentUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";

// Records the browser's IANA timezone so daily AI limits reset at the user's
// own midnight instead of UTC's (migration 20260914120000).
//
// Returns the timezone actually in effect, which can legitimately differ from
// what was sent: the database rejects names it does not know and allows one
// change per 24 hours, so moving your clock forward cannot open a fresh day's
// allowance on demand.
//
// getCurrentUser, not requireUser: this runs from the Navbar on every
// authenticated page, and a session that expired mid-visit must not turn a
// background sync into a redirect.
export async function syncTimezone(timezone: string): Promise<{ timezone: string | null }> {
  if (typeof timezone !== "string" || timezone.length === 0 || timezone.length > 64) {
    return { timezone: null };
  }

  const user = await getCurrentUser();
  if (!user) return { timezone: null };

  const insforge = await createInsforgeServer();
  const { data, error } = await insforge.database.rpc("set_my_timezone", { p_timezone: timezone });
  if (error) {
    console.error("[actions/timezone] set_my_timezone failed:", error.message);
    return { timezone: null };
  }
  return { timezone: (data as string | null) ?? null };
}
