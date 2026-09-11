"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { getInterviewAdminData, type InterviewAdminData, type ModerationStatus } from "@/lib/admin/interviewModeration";
import { toCompanyKey } from "@/lib/atsRegistry";

type ActionResult = { success: boolean; error?: string };

export async function loadInterviewAdmin(): Promise<
  { success: true; data: InterviewAdminData } | { success: false; error: string }
> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin", "support_readonly"]);
    return { success: true, data: await getInterviewAdminData() };
  } catch (error) {
    console.error("[actions/adminInterview] load failed", error);
    return { success: false, error: "Could not load interview contributions." };
  }
}

/**
 * Approve or reject one contributed question.
 *
 * owner+admin only — support_readonly can see the queue (reading what users
 * submitted is squarely support's job) but must not be able to push content
 * onto a public marketing page.
 */
export async function moderateContributedQuestion(id: string, status: ModerationStatus): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    if (!["pending", "published", "rejected"].includes(status)) {
      return { success: false, error: "Unknown moderation status." };
    }

    const client = createAdminDbClient();
    const { error } = await client.database
      .from("contributed_interview_questions")
      .update({ status, moderated_at: new Date().toISOString(), moderated_by: admin.email })
      .eq("id", id);

    if (error) {
      console.error("[actions/adminInterview] moderate failed", error.message);
      return { success: false, error: "Could not update that submission." };
    }

    // The public company page and the hub both read this table, so a
    // decision here has to invalidate them or an approved question sits
    // invisible behind a cached render.
    revalidatePath("/admin/interview");
    revalidatePath("/interview");
    revalidatePath("/interview-questions", "layout");
    return { success: true };
  } catch (error) {
    console.error("[actions/adminInterview] moderate threw", error);
    return { success: false, error: "Something went wrong." };
  }
}

export async function deleteContributedQuestion(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    const client = createAdminDbClient();
    const { error } = await client.database.from("contributed_interview_questions").delete().eq("id", id);

    if (error) {
      console.error("[actions/adminInterview] delete failed", error.message);
      return { success: false, error: "Could not delete that submission." };
    }

    revalidatePath("/admin/interview");
    revalidatePath("/interview");
    revalidatePath("/interview-questions", "layout");
    return { success: true };
  } catch (error) {
    console.error("[actions/adminInterview] delete threw", error);
    return { success: false, error: "Something went wrong." };
  }
}

/**
 * Add a question directly from the admin site (the user's own ask) rather
 * than only through the public contribute modal.
 *
 * Stored with source='admin' and published immediately — an admin adding it
 * IS the review step. The source column keeps "a real candidate reported
 * this" distinguishable from "we added it", which matters on a page whose
 * entire value proposition is that the questions are genuine.
 *
 * user_id is the acting admin's own auth id: the column is NOT NULL and FKs
 * to auth.users, and attributing it truthfully beats inventing a synthetic
 * owner.
 */
export async function addAdminInterviewQuestion(input: {
  company: string;
  role: string;
  question: string;
  interviewDate: string | null;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    const company = input.company.trim();
    const role = input.role.trim();
    const question = input.question.trim();

    if (!company) return { success: false, error: "Company is required." };
    if (!role) return { success: false, error: "Role is required." };
    if (question.length < 10) return { success: false, error: "That question looks too short to be useful." };
    if (question.length > 2000) return { success: false, error: "That question is too long." };

    if (!admin.userId) {
      return { success: false, error: "Your admin record has no linked auth user, so this can't be attributed." };
    }

    const client = createAdminDbClient();
    const { error } = await client.database.from("contributed_interview_questions").insert([
      {
        user_id: admin.userId,
        company,
        company_key: toCompanyKey(company),
        role,
        question,
        interview_date: input.interviewDate || null,
        status: "published",
        source: "admin",
        moderated_at: new Date().toISOString(),
        moderated_by: admin.email,
      },
    ]);

    if (error) {
      console.error("[actions/adminInterview] add failed", error.message);
      return { success: false, error: "Could not add that question." };
    }

    revalidatePath("/admin/interview");
    revalidatePath("/interview");
    revalidatePath("/interview-questions", "layout");
    return { success: true };
  } catch (error) {
    console.error("[actions/adminInterview] add threw", error);
    return { success: false, error: "Something went wrong." };
  }
}
