"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { createAdminDbClient } from "@/lib/admin/client";
import { toCompanyKey } from "@/lib/atsRegistry";

type ActionResult = { success: boolean; error?: string };

export type ContributedQuestion = {
  id: string;
  company: string;
  role: string;
  interviewDate: string | null;
  question: string;
  createdAt: string;
};

const MAX_COMPANY_LEN = 100;
const MAX_ROLE_LEN = 100;
const MAX_QUESTION_LEN = 2000;

// Real candidates submitting a real question they were actually asked — the
// second source feeding the Interview Prep hub, alongside the AI-generated
// question banks (lib/interviewSeo.ts). Deliberately NOT gated behind the
// signup cap the way requireUser() gates most of the app (see lib/auth.ts) —
// a rejected contribution because the account cap is full is a worse
// experience than letting an already-authenticated user contribute freely,
// and this write is cheap (no AI/Browserbase cost), so it's exempted from
// that specific guard by using getCurrentUser() directly rather than
// requireUser().
export async function submitInterviewQuestion(input: {
  company: string;
  role: string;
  interviewDate: string | null;
  question: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Sign in to contribute a question." };
  }

  const company = input.company.trim();
  const role = input.role.trim();
  const question = input.question.trim();

  if (!company || company.length > MAX_COMPANY_LEN) {
    return { success: false, error: "Give a real company name (under 100 characters)." };
  }
  if (!role || role.length > MAX_ROLE_LEN) {
    return { success: false, error: "Give the role you interviewed for (under 100 characters)." };
  }
  if (!question || question.length < 10) {
    return { success: false, error: "Share the actual question — a few words isn't enough for another candidate to prepare with." };
  }
  if (question.length > MAX_QUESTION_LEN) {
    return { success: false, error: `Keep it under ${MAX_QUESTION_LEN} characters.` };
  }

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database.from("contributed_interview_questions").insert([
      {
        user_id: user.id,
        company,
        company_key: toCompanyKey(company),
        role,
        interview_date: input.interviewDate || null,
        question,
      },
    ]);

    if (error) {
      console.error("[actions/interviewContributions] insert failed", error.message);
      return { success: false, error: "Could not save that — try again." };
    }

    revalidatePath("/interview-questions");
    revalidatePath(`/interview-questions/company/${toCompanyKey(company)}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/interviewContributions]", error);
    return { success: false, error: "Something went wrong." };
  }
}

// Public read, for the marketing hub — via the admin client, same bypass
// interview_question_banks already uses (no public SELECT policy is
// deliberate, see the migration's own comment); this function is the one
// place that's true for contributed questions too.
export async function listContributedQuestionsByCompanyKey(companyKey: string): Promise<ContributedQuestion[]> {
  const client = createAdminDbClient();
  const { data, error } = await client.database
    .from("contributed_interview_questions")
    .select("id,company,role,interview_date,question,created_at")
    .eq("company_key", companyKey)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[actions/interviewContributions] list failed", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    company: row.company as string,
    role: row.role as string,
    interviewDate: (row.interview_date as string | null) ?? null,
    question: row.question as string,
    createdAt: row.created_at as string,
  }));
}
