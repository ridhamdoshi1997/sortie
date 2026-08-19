"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { logAdminAction } from "@/lib/admin/audit";
import { listSocialDrafts, type SocialDraftRow, type SocialDraftStatus } from "@/lib/admin/socialDrafts";
import { toUserMessage } from "@/lib/errors";

// "Success Story" approval inbox (Phase 18 item 2, context/RESUME.md). Same
// requireAdmin()-inside-every-action pattern as the rest of /admin.
type ActionResult = { success: true } | { success: false; error: string };

type SocialDraftsListResult = { success: true; drafts: SocialDraftRow[] } | { success: false; error: string };

export async function getSocialDraftsList(): Promise<SocialDraftsListResult> {
  try {
    await requireAdmin();
    const drafts = await listSocialDrafts();
    return { success: true, drafts };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// "posted" is a manual bookkeeping status only — this app has no direct
// social-posting integration (no Twitter/LinkedIn API wired up), so
// "posted" just means an admin actually pasted the approved thread
// somewhere themselves and is marking it done, same honest boundary as
// every other "AI drafts, human executes" surface in this app.
export async function setSocialDraftStatus(id: string, status: SocialDraftStatus): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const { error } = await client.database
      .from("social_drafts")
      .update({ status, reviewed_by: admin.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return { success: false, error: toUserMessage(error, "Failed to update this draft.") };

    await logAdminAction(admin, { action: `social_draft_${status}`, targetTable: "social_drafts", targetId: id });

    revalidatePath("/admin/marketing");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}
