"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { inngest } from "@/lib/inngest/client";

type ActionResult = { success: boolean; error?: string };

export type AccomplishmentRow = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  tags: string[];
  related_job_id: string | null;
  source: "manual" | "job_outcome";
  created_at: string;
  updated_at: string;
};

const ACCOMPLISHMENT_COLUMNS = "id,title,description,date,tags,related_job_id,source,created_at,updated_at";

export async function listAccomplishments(): Promise<{
  success: boolean;
  data?: AccomplishmentRow[];
  error?: string;
}> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.database
      .from("accomplishments")
      .select(ACCOMPLISHMENT_COLUMNS)
      .eq("user_id", user.id)
      .order("date", { ascending: false });

    if (error) {
      console.error("[actions/accomplishments] listAccomplishments", error);
      return { success: false, error: "Failed to load your accomplishments" };
    }

    return { success: true, data: (data ?? []) as AccomplishmentRow[] };
  } catch (error) {
    console.error("[actions/accomplishments] listAccomplishments", error);
    return { success: false, error: "Failed to load your accomplishments" };
  }
}

type AccomplishmentInput = {
  title: string;
  description: string;
  date: string;
  tags: string[];
};

export async function addAccomplishment(input: AccomplishmentInput): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data: accomplishment, error } = await insforge.database
      .from("accomplishments")
      .insert([
        {
          user_id: user.id,
          title: input.title,
          description: input.description || null,
          date: input.date,
          tags: input.tags,
        },
      ])
      .select("id")
      .single<{ id: string }>();

    if (error || !accomplishment) {
      console.error("[actions/accomplishments] addAccomplishment", error);
      return { success: false, error: "Failed to save this accomplishment" };
    }

    // §Q4c Always-warm résumé — fire-and-forget, never blocks the save. A
    // failed send here shouldn't fail the accomplishment log itself (the
    // suggestion is a nice-to-have queued in the background, not a
    // required side effect of logging real career history).
    try {
      await inngest.send({
        name: "accomplishments/logged",
        data: { accomplishmentId: accomplishment.id, userId: user.id },
      });
    } catch (sendError) {
      console.error("[actions/accomplishments] failed to queue résumé suggestion", sendError);
    }

    revalidatePath("/career");
    return { success: true };
  } catch (error) {
    console.error("[actions/accomplishments] addAccomplishment", error);
    return { success: false, error: "Failed to save this accomplishment" };
  }
}

export async function updateAccomplishment(id: string, input: AccomplishmentInput): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("accomplishments")
      .update({
        title: input.title,
        description: input.description || null,
        date: input.date,
        tags: input.tags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/accomplishments] updateAccomplishment", error);
      return { success: false, error: "Failed to update this accomplishment" };
    }

    revalidatePath("/career");
    return { success: true };
  } catch (error) {
    console.error("[actions/accomplishments] updateAccomplishment", error);
    return { success: false, error: "Failed to update this accomplishment" };
  }
}

export async function deleteAccomplishment(id: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("accomplishments")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/accomplishments] deleteAccomplishment", error);
      return { success: false, error: "Failed to delete this accomplishment" };
    }

    revalidatePath("/career");
    return { success: true };
  } catch (error) {
    console.error("[actions/accomplishments] deleteAccomplishment", error);
    return { success: false, error: "Failed to delete this accomplishment" };
  }
}
