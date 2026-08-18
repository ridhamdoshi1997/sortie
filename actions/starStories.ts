"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { checkAndConsumeUsage } from "@/lib/usage";
import { toUserMessage } from "@/lib/errors";
import { matchStoriesToQuestions, type StarMatchResult } from "@/lib/starStoryMatcher";
import { getOrGenerateQuestionBank } from "@/actions/interviewQuestions";

type ActionResult = { success: boolean; error?: string };

export type StarStoryRow = {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
  accomplishment_id: string | null;
  interview_event_id: string | null;
  created_at: string;
  updated_at: string;
};

const STAR_STORY_COLUMNS =
  "id,title,situation,task,action,result,tags,accomplishment_id,interview_event_id,created_at,updated_at";

export async function listStarStories(): Promise<{ success: boolean; data?: StarStoryRow[]; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.database
      .from("star_stories")
      .select(STAR_STORY_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[actions/starStories] listStarStories", error);
      return { success: false, error: "Failed to load your stories" };
    }

    return { success: true, data: (data ?? []) as StarStoryRow[] };
  } catch (error) {
    console.error("[actions/starStories] listStarStories", error);
    return { success: false, error: "Failed to load your stories" };
  }
}

type StarStoryInput = {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  tags: string[];
};

export async function addStarStory(input: StarStoryInput): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database.from("star_stories").insert([
      {
        user_id: user.id,
        title: input.title,
        situation: input.situation,
        task: input.task,
        action: input.action,
        result: input.result,
        tags: input.tags,
      },
    ]);

    if (error) {
      console.error("[actions/starStories] addStarStory", error);
      return { success: false, error: "Failed to save this story" };
    }

    revalidatePath("/interview");
    return { success: true };
  } catch (error) {
    console.error("[actions/starStories] addStarStory", error);
    return { success: false, error: "Failed to save this story" };
  }
}

export async function updateStarStory(id: string, input: StarStoryInput): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("star_stories")
      .update({
        title: input.title,
        situation: input.situation,
        task: input.task,
        action: input.action,
        result: input.result,
        tags: input.tags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/starStories] updateStarStory", error);
      return { success: false, error: "Failed to update this story" };
    }

    revalidatePath("/interview");
    return { success: true };
  } catch (error) {
    console.error("[actions/starStories] updateStarStory", error);
    return { success: false, error: "Failed to update this story" };
  }
}

export async function deleteStarStory(id: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("star_stories")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/starStories] deleteStarStory", error);
      return { success: false, error: "Failed to delete this story" };
    }

    revalidatePath("/interview");
    return { success: true };
  } catch (error) {
    console.error("[actions/starStories] deleteStarStory", error);
    return { success: false, error: "Failed to delete this story" };
  }
}

// §Q4a STAR Vault — optional provenance link to the specific interview_events
// row a story was used for, surfaced on /career independent of the
// job-matching flow above. Ownership double-checked on both rows (the FK
// alone doesn't stop linking someone else's interview event id).
export async function linkStarStoryToInterview(
  storyId: string,
  interviewEventId: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    if (interviewEventId) {
      const { data: event } = await insforge.database
        .from("interview_events")
        .select("id")
        .eq("id", interviewEventId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!event) {
        return { success: false, error: "That interview couldn't be found." };
      }
    }

    const { error } = await insforge.database
      .from("star_stories")
      .update({ interview_event_id: interviewEventId, updated_at: new Date().toISOString() })
      .eq("id", storyId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/starStories] linkStarStoryToInterview", error);
      return { success: false, error: "Failed to update this story's link" };
    }

    revalidatePath("/career");
    return { success: true };
  } catch (error) {
    console.error("[actions/starStories] linkStarStoryToInterview", error);
    return { success: false, error: "Failed to update this story's link" };
  }
}

type MatchResult = { success: true; result: StarMatchResult } | { success: false; error: string };

// Reuses getOrGenerateQuestionBank verbatim for the question-bank half (its
// own interview_question_bank usage key covers a real cache miss there) —
// this action's own usage gate only covers the matching call itself.
export async function matchStoriesToRole(
  rawCompany: string,
  rawTitle: string,
  rawSeniority: string,
): Promise<MatchResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: stories } = await insforge.database
      .from("star_stories")
      .select(STAR_STORY_COLUMNS)
      .eq("user_id", user.id)
      .returns<StarStoryRow[]>();

    if (!stories || stories.length === 0) {
      return { success: false, error: "Add at least one STAR story first, then try matching again." };
    }

    const bankResult = await getOrGenerateQuestionBank(rawCompany, rawTitle, rawSeniority);
    if (!bankResult.success) {
      return { success: false, error: bankResult.error };
    }

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "star_story_matching");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const result = await matchStoriesToQuestions(
      stories.map((s) => ({
        id: s.id,
        title: s.title,
        situation: s.situation,
        task: s.task,
        action: s.action,
        result: s.result,
      })),
      bankResult.bank.questions,
    );

    return { success: true, result };
  } catch (error) {
    console.error("[actions/starStories] matchStoriesToRole", error);
    return { success: false, error: toUserMessage(error, "Failed to match your stories to this role.") };
  }
}
