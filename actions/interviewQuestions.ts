"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkAndConsumeUsage } from "@/lib/usage";
import { toUserMessage } from "@/lib/errors";
import {
  buildCacheKey,
  generateQuestionBank,
  normalizeRoleFamily,
  type InterviewQuestion,
  type QuestionBank,
} from "@/lib/interviewQuestions";

type QuestionBankRow = {
  id: string;
  company: string;
  role_family: string;
  seniority: string;
  questions: InterviewQuestion[];
  generated_at: string;
};

function toQuestionBank(row: QuestionBankRow): QuestionBank {
  return {
    id: row.id,
    company: row.company,
    roleFamily: row.role_family,
    seniority: row.seniority,
    questions: row.questions,
    generatedAt: row.generated_at,
  };
}

type Result = { success: true; bank: QuestionBank } | { success: false; error: string };

// Cache-check-then-generate: a hit is a free read (no rate limit, no usage
// consumed, no AI call) — only a genuine miss triggers real generation and
// gets gated. Shared across every user (interview_question_banks has no
// user_id column, see the migration), so most calls after the first for any
// given (company, role_family, seniority) are instant free reads.
export async function getOrGenerateQuestionBank(
  rawCompany: string,
  rawTitle: string,
  rawSeniority: string,
): Promise<Result> {
  const user = await requireUser();
  const company = rawCompany.trim();
  const roleFamily = normalizeRoleFamily(rawTitle);
  const seniority = rawSeniority.trim();

  if (!company || !roleFamily) {
    return { success: false, error: "Enter at least a company and a role." };
  }

  const cacheKey = buildCacheKey(company, roleFamily, seniority);

  try {
    const insforge = await createInsforgeServer();

    const { data: existing } = await insforge.database
      .from("interview_question_banks")
      .select("id,company,role_family,seniority,questions,generated_at")
      .eq("cache_key", cacheKey)
      .maybeSingle<QuestionBankRow>();

    if (existing) {
      return { success: true, bank: toQuestionBank(existing) };
    }

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "interview/question-bank");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "interview_question_bank");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const questions = await generateQuestionBank(company, roleFamily, seniority);

    const { data: inserted, error } = await insforge.database
      .from("interview_question_banks")
      .insert([
        {
          cache_key: cacheKey,
          company,
          role_family: roleFamily,
          seniority: seniority || "unspecified",
          questions,
        },
      ])
      .select("id,company,role_family,seniority,questions,generated_at")
      .single<QuestionBankRow>();

    // A concurrent request for the same cache key can lose the unique-
    // constraint race — fall back to reading whatever the winner inserted
    // rather than surfacing a spurious error for a real cache hit.
    if (error || !inserted) {
      const { data: raceWinner } = await insforge.database
        .from("interview_question_banks")
        .select("id,company,role_family,seniority,questions,generated_at")
        .eq("cache_key", cacheKey)
        .maybeSingle<QuestionBankRow>();

      if (raceWinner) return { success: true, bank: toQuestionBank(raceWinner) };

      console.error("[actions/interviewQuestions] insert failed", error);
      return { success: false, error: "Couldn't save the generated question bank. Please try again." };
    }

    return { success: true, bank: toQuestionBank(inserted) };
  } catch (error) {
    console.error("[actions/interviewQuestions] getOrGenerateQuestionBank", error);
    return { success: false, error: toUserMessage(error, "Failed to load interview questions.") };
  }
}
