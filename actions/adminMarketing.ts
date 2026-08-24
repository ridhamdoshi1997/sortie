"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { logAdminAction } from "@/lib/admin/audit";
import { listBroadcasts, getBroadcastById, getSegmentRecipientCounts, generateBroadcastDraft, type BroadcastRow, type BroadcastSegment } from "@/lib/admin/marketing";
import { inngest } from "@/lib/inngest/client";
import { toUserMessage } from "@/lib/errors";

// Marketing broadcasts (admin console expansion item 5, context/RESUME.md).
// Same requireAdmin()-inside-every-action + requireRole() pattern as the
// rest of /admin. Every write here is owner+admin-gated — no
// support_readonly write path, matching every other admin write surface.
type ActionResult = { success: true } | { success: false; error: string };

type BroadcastsListResult = { success: true; broadcasts: BroadcastRow[]; segmentCounts: Record<BroadcastSegment, number> } | { success: false; error: string };

export async function getBroadcastsList(): Promise<BroadcastsListResult> {
  try {
    await requireAdmin();
    const [broadcasts, segmentCounts] = await Promise.all([listBroadcasts(), getSegmentRecipientCounts()]);
    return { success: true, broadcasts, segmentCounts };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type BroadcastDetailResult = { success: true; broadcast: BroadcastRow } | { success: false; error: string };

export async function getBroadcastDetail(id: string): Promise<BroadcastDetailResult> {
  try {
    await requireAdmin();
    const broadcast = await getBroadcastById(id);
    if (!broadcast) return { success: false, error: "Broadcast not found." };
    return { success: true, broadcast };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type SaveBroadcastResult = { success: true; id: string } | { success: false; error: string };

export async function saveBroadcast(id: string | null, subject: string, bodyMarkdown: string, segment: BroadcastSegment): Promise<SaveBroadcastResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const trimmedSubject = subject.trim();
    if (!trimmedSubject) return { success: false, error: "Enter a subject." };

    if (id) {
      const existing = await getBroadcastById(id);
      if (!existing) return { success: false, error: "Broadcast not found." };
      if (existing.status !== "draft") return { success: false, error: "Only draft broadcasts can be edited." };

      const { error } = await client.database
        .from("marketing_broadcasts")
        .update({ subject: trimmedSubject, body_markdown: bodyMarkdown, segment, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return { success: false, error: toUserMessage(error, "Failed to save this broadcast.") };

      revalidatePath("/admin/marketing");
      revalidatePath(`/admin/marketing/${id}`);
      return { success: true, id };
    }

    const { data, error } = await client.database
      .from("marketing_broadcasts")
      .insert([{ subject: trimmedSubject, body_markdown: bodyMarkdown, segment, status: "draft", created_by: admin.id }])
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { success: false, error: toUserMessage(error, "Failed to create this broadcast.") };

    await logAdminAction(admin, { action: "create_marketing_broadcast", targetTable: "marketing_broadcasts", targetId: data.id, after: { subject: trimmedSubject } });

    revalidatePath("/admin/marketing");
    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function deleteBroadcast(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const existing = await getBroadcastById(id);
    if (!existing) return { success: false, error: "Broadcast not found." };
    if (existing.status === "sending") return { success: false, error: "Can't delete a broadcast that's currently sending." };

    const { error } = await client.database.from("marketing_broadcasts").delete().eq("id", id);
    if (error) return { success: false, error: toUserMessage(error, "Failed to delete this broadcast.") };

    await logAdminAction(admin, { action: "delete_marketing_broadcast", targetTable: "marketing_broadcasts", targetId: id, before: { subject: existing.subject } });

    revalidatePath("/admin/marketing");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// The real compliance gate — CAN-SPAM requires a physical mailing address
// in every commercial email, unconditionally. Refuses to send at all
// without MARKETING_PHYSICAL_ADDRESS configured, rather than sending with
// a fabricated or missing address. This is separate from (and in addition
// to) the domain-verification constraint on actual delivery — both must
// be satisfied for a real send to actually reach anyone.
export async function sendBroadcast(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    if (!process.env.MARKETING_PHYSICAL_ADDRESS) {
      return { success: false, error: "Set MARKETING_PHYSICAL_ADDRESS before sending — a physical mailing address is required by CAN-SPAM on every commercial email." };
    }

    const broadcast = await getBroadcastById(id);
    if (!broadcast) return { success: false, error: "Broadcast not found." };
    if (broadcast.status !== "draft") return { success: false, error: "This broadcast has already been sent or is sending." };
    if (!broadcast.bodyMarkdown.trim()) return { success: false, error: "Write a message before sending." };

    const client = createAdminDbClient();
    const { error } = await client.database.from("marketing_broadcasts").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { success: false, error: toUserMessage(error, "Failed to start sending.") };

    await logAdminAction(admin, { action: "send_marketing_broadcast", targetTable: "marketing_broadcasts", targetId: id });

    // Batch send via Inngest (already wired up in this codebase for job
    // scoring/résumé suggestions) — not manual Promise.all chunking, per
    // the corrected plan in context/RESUME.md.
    await inngest.send({ name: "marketing/broadcast.send", data: { broadcastId: id } });

    revalidatePath("/admin/marketing");
    revalidatePath(`/admin/marketing/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type DraftResult = { success: true; bodyMarkdown: string } | { success: false; error: string };

export async function generateDraft(subject: string, brief: string): Promise<DraftResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    if (!subject.trim()) return { success: false, error: "Enter a subject first." };

    const bodyMarkdown = await generateBroadcastDraft(subject, brief);
    return { success: true, bodyMarkdown };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to generate a draft.") };
  }
}
