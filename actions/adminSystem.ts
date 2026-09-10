"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { getSystemHealth, type SystemHealth } from "@/lib/systemHealth";

type ActionResult = { success: boolean; error?: string };

export async function loadSystemHealth(): Promise<{ success: true; data: SystemHealth } | { success: false; error: string }> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    return { success: true, data: await getSystemHealth() };
  } catch (error) {
    console.error("[actions/adminSystem] health load failed", error);
    return { success: false, error: "Could not load system health." };
  }
}

/**
 * The ordinary crawl pause an admin flips while investigating something.
 *
 * Deliberately cannot clear the CRAWL_PAUSED env var — that one is the
 * emergency kill switch, it requires a redeploy on purpose, and it always
 * wins. The UI says so rather than pretending this button controls it, which
 * would be the worst possible lie on a page whose whole job is telling an
 * operator the truth about system state.
 */
export async function setCrawlPaused(paused: boolean, reason: string | null): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    const db = createAdminDbClient();
    const { data: existing } = await db.database
      .from("app_settings")
      .select("id")
      .limit(1)
      .maybeSingle<{ id: number }>();

    const patch = {
      crawl_paused: paused,
      crawl_paused_reason: paused ? (reason?.trim() || null) : null,
      crawl_paused_at: paused ? new Date().toISOString() : null,
      crawl_paused_by: paused ? admin.userId : null,
    };

    const { error } = existing
      ? await db.database.from("app_settings").update(patch).eq("id", existing.id)
      : await db.database.from("app_settings").insert([{ ai_enabled: true, ...patch }]);

    if (error) {
      console.error("[actions/adminSystem] crawl pause write failed", error.message);
      return { success: false, error: "Could not update the crawl pause." };
    }

    revalidatePath("/admin/system");
    return { success: true };
  } catch (error) {
    console.error("[actions/adminSystem]", error);
    return { success: false, error: "Something went wrong." };
  }
}
