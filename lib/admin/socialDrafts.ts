import { createAdminDbClient } from "@/lib/admin/client";
import { complete, getModel } from "@/lib/models";

// "Success Story" content repurposing pipeline (Phase 18 item 2,
// context/RESUME.md). Triggered when a real user milestone lands
// (jobs.application_status -> 'offered', see actions/jobs.ts's
// setApplicationStatus). The generated content is ANONYMIZED by design —
// the prompt below is instructed to never use the real person's name or
// exact company/job title, only the shape of the story (role family,
// industry type, journey length if derivable). This is marketing content
// about a real outcome, not a testimonial attributed to a real person —
// treat that distinction as load-bearing, not cosmetic.
export type SocialDraftStatus = "pending_review" | "approved" | "rejected" | "posted";

export type SocialDraftRow = {
  id: string;
  sourceType: "application_offer" | "compensation_event";
  headline: string;
  threadMarkdown: string;
  status: SocialDraftStatus;
  createdAt: string;
};

type RawSocialDraftRow = {
  id: string;
  source_type: "application_offer" | "compensation_event";
  headline: string;
  thread_markdown: string;
  status: SocialDraftStatus;
  created_at: string;
};

function mapRow(d: RawSocialDraftRow): SocialDraftRow {
  return {
    id: d.id,
    sourceType: d.source_type,
    headline: d.headline,
    threadMarkdown: d.thread_markdown,
    status: d.status,
    createdAt: d.created_at,
  };
}

export async function listSocialDrafts(): Promise<SocialDraftRow[]> {
  const admin = createAdminDbClient();
  const { data } = await admin.database
    .from("social_drafts")
    .select("id,source_type,headline,thread_markdown,status,created_at")
    .order("created_at", { ascending: false });

  return ((data ?? []) as RawSocialDraftRow[]).map(mapRow);
}

const SUCCESS_STORY_SYSTEM_PROMPT = `You are drafting social proof marketing content for Sortie, a job-search copilot, based on one real user's job-search outcome.

CRITICAL — this must be fully anonymized: never use the person's real name, their exact company name, their exact job title, or any other detail that could identify them. Refer to them only as "one Sortie user" or similar. Describe their role generically (e.g. "a mid-level software engineer" rather than the exact title) and their target company only by type/industry (e.g. "a Series B fintech startup") if that context is provided, never by name.

Ground every concrete detail (timeframe, number of applications, etc.) ONLY in the real data given — never invent statistics, quotes, or details not present in the input. If a detail isn't provided, don't guess at it or imply a specific number.

Write a 3-part thread (works as either a Twitter/X thread or a LinkedIn post broken into 3 short paragraphs):
Part 1: The hook — the outcome, stated plainly and specifically (anonymized).
Part 2: The real texture of the journey — what was hard, what shifted, grounded only in the real data given.
Part 3: A soft mention of Sortie's role (its 10-dimension job-fit evaluation, honest AI over auto-apply) as part of the story, not a hard sell, plus a natural closing line.

Output ONLY the 3 parts as plain paragraphs separated by a blank line, no headers, no numbering, no hashtags unless natural.`;

type SuccessStoryInput = {
  roleFamily: string;
  daysSinceFirstTracked: number | null;
};

async function draftSuccessStory(input: SuccessStoryInput): Promise<{ headline: string; threadMarkdown: string }> {
  const userPrompt = `Anonymized outcome data:
Role family: ${input.roleFamily}
Days tracked in Sortie before this offer: ${input.daysSinceFirstTracked !== null ? input.daysSinceFirstTracked : "not available — don't mention a specific duration"}`;

  const threadMarkdown = await complete(getModel("gemini", "smart"), {
    systemPrompt: SUCCESS_STORY_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.6,
    maxTokens: 700,
  });

  return {
    headline: `Success story — ${input.roleFamily}`,
    threadMarkdown: threadMarkdown.trim(),
  };
}

// Called from the Inngest function (lib/inngest/functions.ts) right after a
// real 'offered' status transition. Idempotent via the DB's own
// UNIQUE(source_type, source_id) constraint — a duplicate event (e.g. a
// retried Inngest step) fails the insert silently rather than double-drafting.
export async function generateAndQueueSuccessStory(jobId: string, userId: string): Promise<{ draftId: string } | null> {
  const admin = createAdminDbClient();

  const { data: job } = await admin.database
    .from("jobs")
    .select("title,found_at")
    .eq("id", jobId)
    .maybeSingle<{ title: string; found_at: string | null }>();

  if (!job) return null;

  const { normalizeRoleFamily } = await import("@/lib/interviewQuestions");
  const roleFamily = normalizeRoleFamily(job.title ?? "this role");

  const daysSinceFirstTracked = job.found_at
    ? Math.round((Date.now() - new Date(job.found_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const draft = await draftSuccessStory({ roleFamily, daysSinceFirstTracked });

  const { data, error } = await admin.database
    .from("social_drafts")
    .insert([
      {
        source_type: "application_offer",
        source_id: jobId,
        user_id: userId,
        headline: draft.headline,
        thread_markdown: draft.threadMarkdown,
      },
    ])
    .select("id")
    .single<{ id: string }>();

  // A unique-constraint violation here means this exact offer already has a
  // draft — a normal, expected outcome (e.g. a retried event), not an error
  // worth throwing over.
  if (error) {
    if (error.message?.includes("duplicate") || error.message?.includes("unique")) return null;
    throw new Error(`Failed to queue success story for job ${jobId}: ${error.message}`);
  }

  return data ? { draftId: data.id } : null;
}
