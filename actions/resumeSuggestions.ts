"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";

type ActionResult = { success: boolean; error?: string };

// §Q4c Always-warm résumé — the review queue for suggestions the background
// Inngest job (lib/inngest/functions.ts's generateResumeSuggestionAsync)
// queues on every new accomplishment. v1 scope is deliberately conservative:
// Accept marks a suggestion reviewed and ready to copy into whichever
// résumé the user chooses — it does NOT silently insert into a specific
// résumé slot/role, since there's no single deterministic "base résumé"
// target and this app's standing rule (Navigator's action-confirm cards)
// is never a silent write to a document the user didn't choose.

export type ResumeSuggestionRow = {
  id: string;
  accomplishment_id: string;
  suggested_bullet: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  accomplishmentTitle: string;
  accomplishmentDescription: string | null;
};

export async function listPendingResumeSuggestions(): Promise<{
  success: boolean;
  data?: ResumeSuggestionRow[];
  error?: string;
}> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data: suggestions, error } = await insforge.database
      .from("resume_update_suggestions")
      .select("id,accomplishment_id,suggested_bullet,status,created_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[actions/resumeSuggestions] listPendingResumeSuggestions", error);
      return { success: false, error: "Failed to load your résumé suggestions" };
    }

    if (!suggestions || suggestions.length === 0) {
      return { success: true, data: [] };
    }

    const accomplishmentIds = [...new Set(suggestions.map((s) => s.accomplishment_id))];
    const { data: accomplishments } = await insforge.database
      .from("accomplishments")
      .select("id,title,description")
      .in("id", accomplishmentIds);

    const accomplishmentsById = new Map((accomplishments ?? []).map((a) => [a.id, a]));

    const result: ResumeSuggestionRow[] = suggestions.map((s) => ({
      id: s.id,
      accomplishment_id: s.accomplishment_id,
      suggested_bullet: s.suggested_bullet,
      status: s.status as ResumeSuggestionRow["status"],
      created_at: s.created_at,
      accomplishmentTitle: accomplishmentsById.get(s.accomplishment_id)?.title ?? "A logged accomplishment",
      accomplishmentDescription: accomplishmentsById.get(s.accomplishment_id)?.description ?? null,
    }));

    return { success: true, data: result };
  } catch (error) {
    console.error("[actions/resumeSuggestions] listPendingResumeSuggestions", error);
    return { success: false, error: "Failed to load your résumé suggestions" };
  }
}

async function setSuggestionStatus(id: string, status: "accepted" | "rejected"): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("resume_update_suggestions")
      .update({ status })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/resumeSuggestions] setSuggestionStatus", error);
      return { success: false, error: "Failed to update this suggestion" };
    }

    revalidatePath("/career");
    return { success: true };
  } catch (error) {
    console.error("[actions/resumeSuggestions] setSuggestionStatus", error);
    return { success: false, error: "Failed to update this suggestion" };
  }
}

export async function acceptResumeSuggestion(id: string): Promise<ActionResult> {
  return setSuggestionStatus(id, "accepted");
}

export async function rejectResumeSuggestion(id: string): Promise<ActionResult> {
  return setSuggestionStatus(id, "rejected");
}
