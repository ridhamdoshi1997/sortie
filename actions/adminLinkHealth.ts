"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/lib/inngest/client";
import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { getLinkHealthFull, type LinkHealthFullReport } from "@/lib/admin/linkHealth";

type ActionResult = { success: boolean; error?: string };

export async function reloadLinkHealth(): Promise<
  { success: true; data: LinkHealthFullReport } | { success: false; error: string }
> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    return { success: true, data: await getLinkHealthFull() };
  } catch (error) {
    console.error("[actions/adminLinkHealth] reload failed", error);
    return { success: false, error: "Could not re-check link health." };
  }
}

/**
 * Kick the existing hourly repair cron on demand.
 *
 * Fires the same Inngest function the cron does (`repair-apply-links`, now
 * carrying an event trigger alongside its schedule) rather than
 * reimplementing repair here — one code path, one crawlPausedNow() guard.
 *
 * Note it returns as soon as the event is accepted. Repair runs in the
 * background and the numbers on this page will not move until it finishes,
 * which the UI says rather than implying an instant fix.
 */
export async function triggerApplyLinkRepair(): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    await inngest.send({ name: "admin/repair-apply-links", data: { triggeredBy: admin.email ?? "admin" } });

    revalidatePath("/admin/link-health");
    return { success: true };
  } catch (error) {
    console.error("[actions/adminLinkHealth] trigger failed", error);
    return { success: false, error: "Could not queue a repair run." };
  }
}
