import { z } from "zod";

import { complete, getModel } from "@/lib/models";

// Free ATS score checker (build-plan.md §I, no-login lead magnet). Distinct
// from the authenticated lib/atsChecker.ts — that one computes deterministic
// structural risk from this app's OWN ResumeSection/ResumeStyle data model;
// this one has no structured data at all (just pasted resume text from an
// anonymous visitor), so every read here is an honest AI judgment call, not
// a deterministic check — the copy in the system prompt and the UI must
// stay honest about that distinction, never claim the precision the
// authenticated tool has.
export type PublicAtsFlag = {
  severity: "info" | "warning";
  note: string; // one honest, specific sentence
};

export type PublicAtsResult = {
  overallScore: number; // 0-100
  formattingFlags: PublicAtsFlag[];
  keywordCoverage: { matched: string[]; missing: string[] } | null; // null when no job description was given
  suggestions: string[]; // 2-4 concrete, actionable
};

const flagSchema = z.object({ severity: z.enum(["info", "warning"]), note: z.string().min(1) });

// Upper bounds are CLAMPED, not enforced as rejections.
//
// These `.max()` limits used to fail the parse outright, and a failed parse
// throws the entire analysis away and shows the visitor "Automated analysis
// failed — please try again." Observed live 2026-09-11: a completely valid,
// useful response was discarded because the model returned 5 suggestions
// where the schema allowed 4. That is a presentation preference being
// enforced as a correctness gate, on the app's public top-of-funnel feature.
//
// The prompt still asks for 2-4; if the model returns more, the extras are
// dropped and the visitor gets their result. Only genuinely unusable output
// (missing fields, a non-numeric score) should ever reach fallbackResult().
const resultSchema = z.object({
  result: z.object({
    overallScore: z.number().min(0).max(100),
    formattingFlags: z.array(flagSchema).transform((a) => a.slice(0, 6)),
    keywordCoverage: z
      .object({ matched: z.array(z.string()), missing: z.array(z.string()) })
      .nullable(),
    suggestions: z.array(z.string().min(1)).min(1).transform((a) => a.slice(0, 4)),
  }),
});

function fallbackResult(): PublicAtsResult {
  return {
    overallScore: 0,
    formattingFlags: [{ severity: "warning", note: "Automated analysis failed — please try again." }],
    keywordCoverage: null,
    suggestions: ["Try again in a moment."],
  };
}

const SYSTEM_PROMPT = `You are giving an honest, free ATS-compatibility read on a resume pasted as plain text by an anonymous visitor.

Hard constraints:
- You only have plain text — you cannot see real formatting, columns, fonts, or graphics. Never claim to detect a formatting risk you cannot actually see from text alone (e.g. never claim "this uses a multi-column layout" unless the text's own line structure genuinely suggests it, like columns of dates/text interleaved oddly).
- Real, honestly-checkable formatting/parseability signals from text alone: non-standard section headers (e.g. "My Journey" instead of "Experience"), missing standard sections (no clear Experience or Education section), walls of text with no bullet structure, contact info that looks malformed or missing, inconsistent date formats.
- If a job description is provided, do real keyword coverage: list specific skills/technologies/qualifications from the job description that genuinely appear in the resume (matched) and ones that don't (missing). If no job description is given, keywordCoverage must be null — do not invent generic keywords.
- overallScore should weight formatting risk and (if present) keyword coverage. Score honestly — most real resumes score 60-85, reserve 90+ for genuinely strong, clean documents and under 50 for resumes with real structural problems.
- suggestions must be concrete and specific to what you actually observed in this resume, never generic filler advice.
- Never fabricate statistics about ATS systems, hiring rates, or rejection percentages.

Return ONLY valid JSON:
{
  "result": {
    "overallScore": number,
    "formattingFlags": [{ "severity": "info"|"warning", "note": "string" }],
    "keywordCoverage": {"matched": ["string"], "missing": ["string"]} | null,
    "suggestions": ["string"]
  }
}`;

export async function checkPublicAtsScore(resumeText: string, jobDescriptionText: string | null): Promise<PublicAtsResult> {
  // 8000 silently truncated any résumé the route's own MAX_RESUME_LENGTH
  // (20000, app/api/tools/ats-check/route.ts) had already accepted as
  // valid — the same class of bug as actions/profile.ts's extraction
  // truncation (found investigating that one): content past the cutoff
  // never reaches the model, with nothing telling the visitor part of
  // their résumé was never analyzed. Matches the route's own accepted max
  // so nothing this route validates as valid can still be silently dropped.
  const userPrompt = `RESUME TEXT:\n${resumeText.slice(0, 20000)}\n\n${
    jobDescriptionText ? `JOB DESCRIPTION TEXT:\n${jobDescriptionText.slice(0, 4000)}` : "No job description was provided — keywordCoverage must be null."
  }`;

  // "fast" (the FREE Gemini key), not "smart" (the BILLED one).
  //
  // getModel routes tier -> key: "smart" uses GEMINI_API_KEY, which has
  // Cloud Billing linked, while "fast" uses the separate still-free
  // GEMINI_API_KEY_FAST. resolveModelForUser already sends free-plan users
  // to "fast" for exactly this reason — but this call hardcodes the tier and
  // bypasses that routing entirely.
  //
  // This is the PUBLIC, unauthenticated lead magnet. Every anonymous
  // visitor was billing the paid meter, with no account and no ceiling
  // beyond a 3/day-per-IP rate limit. It is structured extraction over
  // pasted text, which is what the fast tier is for.
  const raw = await complete(await getModel("gemini", "fast"), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    // Was 1200, which a thinking model could spend entirely on reasoning
    // before emitting any JSON -- the cause of the "Automated analysis
    // failed" this public, top-of-funnel feature was intermittently
    // returning. See lib/models.ts's reasoningEffort comment.
    maxTokens: 4000,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/publicAtsChecker] JSON parse failed", error);
    return fallbackResult();
  }

  const validated = resultSchema.safeParse(parsed);
  if (!validated.success) {
    console.error("[lib/publicAtsChecker] schema validation failed", validated.error);
    return fallbackResult();
  }

  return validated.data.result;
}
