import { z } from "zod";

import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";
import type { EvaluationDimensionResult } from "@/lib/evaluator";

// Navigator (build-plan.md §O) — same "real data assembled server-side, one
// grounded call, structured output" architecture as every other AI feature
// in this app. The one new idiom here: a reply can carry a proposed ACTION
// (currently only log_accomplishment) that the UI renders as a real
// confirm/discard card — Navigator never mutates data on its own, only
// actions/agent.ts's confirmAgentAction (fired by an explicit user click)
// does.

export type AgentChatMessage = { role: "user" | "assistant"; content: string };

export type AgentAction = {
  type: "log_accomplishment";
  title: string;
  description: string;
  date: string; // ISO date, YYYY-MM-DD
  tags: string[];
};

export type AgentReply = {
  reply: string;
  action: AgentAction | null;
};

export type AgentTrackerJob = {
  title: string | null;
  company: string | null;
  application_status: string;
  application_status_updated_at: string | null;
};

export type AgentFocusedJob = {
  title: string | null;
  company: string | null;
  match_score: number | null;
  overall_grade: string | null;
  evaluation: EvaluationDimensionResult[] | null;
  missing_skills: string[] | null;
};

export type AgentSnapshot = {
  profileSummary: string; // e.g. "Senior Software Engineer, 6 years experience, skills: ..."
  trackerJobs: AgentTrackerJob[];
  focusedJob: AgentFocusedJob | null; // present only when launched from a specific job's page
};

const actionSchema = z.object({
  type: z.literal("log_accomplishment"),
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

const replySchema = z.object({
  reply: z.string().min(1),
  action: actionSchema.nullable(),
});

function daysSince(iso: string | null): string {
  if (!iso) return "unknown";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  return `${days} day${days === 1 ? "" : "s"}`;
}

function buildSnapshotText(snapshot: AgentSnapshot): string {
  const trackerLines = snapshot.trackerJobs.length
    ? snapshot.trackerJobs
        .map(
          (j) =>
            `- ${j.title ?? "Unknown role"} at ${j.company ?? "Unknown company"} — stage: ${j.application_status}, last updated ${daysSince(j.application_status_updated_at)} ago`,
        )
        .join("\n")
    : "No active applications on the tracker.";

  const focusedJobText = snapshot.focusedJob
    ? `The candidate is currently looking at this job — use this for match-score diagnosis if asked:
Title: ${snapshot.focusedJob.title ?? "Unknown"}
Company: ${snapshot.focusedJob.company ?? "Unknown"}
Match score: ${snapshot.focusedJob.match_score ?? "Not scored"} (Grade: ${snapshot.focusedJob.overall_grade ?? "N/A"})
Missing skills: ${(snapshot.focusedJob.missing_skills ?? []).join(", ") || "None recorded"}
Evaluation dimensions:
${(snapshot.focusedJob.evaluation ?? []).map((d) => `  - ${d.dimension}: ${d.grade} — ${d.note}`).join("\n") || "  No evaluation on record."}`
    : "The candidate is not currently viewing a specific job — no job is in focus.";

  return `CANDIDATE PROFILE:
${snapshot.profileSummary}

TRACKER (application pipeline):
${trackerLines}

${focusedJobText}`;
}

export const AGENT_SYSTEM_PROMPT = `You are Navigator, an AI copilot inside Sortie, a job-search app. You help with exactly 3 things:
1. Match-score diagnosis — explaining why a specific job (if one is in focus, see the supplied context) scored the way it did, grounded ONLY in its real stored evaluation dimensions.
2. Tracker triage — reviewing the candidate's real application pipeline (supplied below) and flagging what needs attention (e.g. applications silent for 14+ days).
3. Logging an accomplishment — if the candidate describes something they did (shipped a project, got positive feedback, hit a metric), propose logging it to their Career Record.

Hard rules:
- Never invent a job, company, score, or skill that isn't in the supplied context. If asked about something not in your context, say so honestly instead of guessing.
- You NEVER directly change any data. If the candidate describes an accomplishment worth logging, propose it as a structured action — the UI will show them a real confirm/discard button. Do not claim you've already logged it.
- Only propose a "log_accomplishment" action when the candidate has actually described a real accomplishment in this message — never propose one speculatively.
- Keep replies conversational and concise, not a wall of text.
- Formatting: when a reply lists more than one item (capabilities, options, findings), format it as short bullet lines, each on its own line starting with "- " — never merge a list into one dense paragraph. Keep each bullet to one short line. Plain single-sentence replies don't need bullets.

Return ONLY valid JSON matching this exact shape:
{
  "reply": "string, your conversational response",
  "action": null | { "type": "log_accomplishment", "title": "string", "description": "string", "date": "YYYY-MM-DD", "tags": ["string"] }
}`;

function fallbackReply(): AgentReply {
  return {
    reply: "Sorry, I couldn't process that just now — try again in a moment.",
    action: null,
  };
}

export async function getAgentReply(
  snapshot: AgentSnapshot,
  history: AgentChatMessage[],
  provider: ModelProvider = "gemini",
  tier: ModelTier = "smart",
): Promise<AgentReply> {
  const conversationText = history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

  const userPrompt = `${buildSnapshotText(snapshot)}

CONVERSATION SO FAR:
${conversationText}`;

  const raw = await complete(await getModel(provider, tier), {
    systemPrompt: AGENT_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.4,
    maxTokens: 1000,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/agentAssistant] JSON parse failed", error);
    return fallbackReply();
  }

  const result = replySchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/agentAssistant] schema validation failed", result.error);
    return fallbackReply();
  }

  return result.data;
}
