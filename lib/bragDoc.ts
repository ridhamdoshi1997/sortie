import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import { HUMANIZED_WRITING_RULES, BULLET_QUALITY_RULES } from "@/lib/writingStyle";

// §Q4 Brag Doc generator (build-plan.md §Q4) — one Gemini call over a
// user-picked date range of their own already-logged career data
// (accomplishments + compensation_events, once Q1 shipped), turned into a
// structured self-review draft. Same "real data in, honest AI synthesis
// out" pattern as lib/rejectionIntelligence.ts/lib/leverageSynthesizer.ts —
// every highlight must trace back to something the user actually logged,
// never an invented achievement to pad out the document.

export type BragDocHighlight = {
  title: string; // short label for the achievement
  impact: string; // XYZ-formula sentence, grounded in the source accomplishment
};

export type BragDocResult = {
  summary: string; // 2-3 sentence overview of the period's impact
  highlights: BragDocHighlight[];
  skillsShowcased: string[]; // pulled/inferred from the accomplishments' own tags, not invented
};

export type BragDocAccomplishment = {
  title: string;
  description: string | null;
  date: string;
  tags: string[];
};

export type BragDocCompensationEvent = {
  event_type: "offer" | "raise" | "bonus" | "equity_grant";
  effective_date: string;
  notes: string | null;
};

const highlightSchema = z.object({
  title: z.string().min(1),
  impact: z.string().min(1),
});

const bragDocSchema = z.object({
  bragDoc: z.object({
    summary: z.string().min(1),
    highlights: z.array(highlightSchema).min(1).max(12),
    skillsShowcased: z.array(z.string().min(1)).max(15),
  }),
});

function fallbackBragDoc(): BragDocResult {
  return {
    summary: "Automated summary generation failed — your logged accomplishments for this period are listed below as-is.",
    highlights: [],
    skillsShowcased: [],
  };
}

const COMP_EVENT_LABELS: Record<BragDocCompensationEvent["event_type"], string> = {
  offer: "Received an offer",
  raise: "Received a raise",
  bonus: "Received a bonus",
  equity_grant: "Received an equity grant",
};

function buildPeriodText(
  accomplishments: BragDocAccomplishment[],
  compensationEvents: BragDocCompensationEvent[],
): string {
  const accomplishmentLines = accomplishments
    .map((a) => `- [${a.date}] ${a.title}${a.description ? `: ${a.description}` : ""}${a.tags.length ? ` (tags: ${a.tags.join(", ")})` : ""}`)
    .join("\n");

  const compLines = compensationEvents
    .map((c) => `- [${c.effective_date}] ${COMP_EVENT_LABELS[c.event_type]}${c.notes ? `: ${c.notes}` : ""}`)
    .join("\n");

  return `Logged accomplishments in this period:
${accomplishmentLines || "None logged."}

Compensation events in this period:
${compLines || "None logged."}`;
}

export const SYSTEM_PROMPT = `You are helping a candidate draft a self-review / "brag document" from their own logged career accomplishments, for use in a performance review, promotion case, or year-end recap.

You may ONLY draw on the accomplishments and compensation events supplied to you — never invent an achievement, metric, or skill the input doesn't support. If an accomplishment lacks a number, write its impact honestly without fabricating one.

${HUMANIZED_WRITING_RULES}

${BULLET_QUALITY_RULES}

Rules specific to this document:
- summary: 2-3 sentences giving an honest overview of what this period's logged work actually shows — don't inflate a thin period into something it isn't.
- highlights: one entry per accomplishment worth surfacing (skip genuinely minor/duplicate ones if there are many) — title is a short label, impact is one XYZ-formula sentence.
- skillsShowcased: only skills that are actually evidenced by the supplied accomplishments' own tags/descriptions — never a generic list.
- If no accomplishments were supplied, say so plainly in the summary and return an empty highlights array — do not invent content to fill the document.

Return ONLY valid JSON matching this exact shape:
{
  "bragDoc": {
    "summary": "string",
    "highlights": [{ "title": "string", "impact": "string" }],
    "skillsShowcased": ["string"]
  }
}`;

export async function generateBragDoc(
  accomplishments: BragDocAccomplishment[],
  compensationEvents: BragDocCompensationEvent[],
  provider: ModelProvider = "gemini",
): Promise<BragDocResult> {
  const userPrompt = `CANDIDATE'S OWN LOGGED CAREER DATA:\n${buildPeriodText(accomplishments, compensationEvents)}`;

  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.4,
    maxTokens: 3000,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/bragDoc] JSON parse failed", error);
    return fallbackBragDoc();
  }

  const result = bragDocSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/bragDoc] schema validation failed", result.error);
    return fallbackBragDoc();
  }

  return result.data.bragDoc;
}
