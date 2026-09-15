import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";
import { BULLET_QUALITY_RULES, HUMANIZED_WRITING_RULES, USER_INSTRUCTION_PRECEDENCE } from "@/lib/writingStyle";
import type { CompanyResearchDossier, Job, Profile } from "@/types";
import type { GeneratedContent } from "@/components/documents/ResumePDF";
import type { ResumeStyle } from "@/types/resumeEditor";

type DocumentJob = Pick<
  Job,
  "title" | "company" | "about_role" | "matched_skills" | "missing_skills"
>;

type DocumentInput = {
  job: DocumentJob;
  profile: Profile;
  dossier: CompanyResearchDossier;
  provider: ModelProvider;
  tier: ModelTier;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ReviseInput = DocumentInput & {
  messages: ChatMessage[];
};

function buildConversationContext(messages: ChatMessage[]): string {
  return messages
    .map((message) => `${message.role === "user" ? "Candidate" : "You"}: ${message.content}`)
    .join("\n");
}

function buildProfileContext(profile: Profile): string {
  return JSON.stringify({
    full_name: profile.full_name,
    current_title: profile.current_title,
    experience_level: profile.experience_level,
    years_experience: profile.years_experience,
    skills: profile.skills,
    industries: profile.industries,
    work_experience: profile.work_experience,
    education: profile.education,
  });
}

function buildJobContext(job: DocumentJob): string {
  return `Title: ${job.title ?? "Unknown"}
Company: ${job.company ?? "Unknown"}
About the role: ${job.about_role ?? "No saved description"}
Matched skills: ${(Array.isArray(job.matched_skills) ? job.matched_skills : []).join(", ") || "None recorded"}
Missing skills: ${(Array.isArray(job.missing_skills) ? job.missing_skills : []).join(", ") || "None recorded"}`;
}

// Every array is defended, because the TYPE lies about the runtime. This
// dossier is AI-generated and stored as JSONB, so the compiler's guarantee
// that `techStack` is a string[] holds only for rows written by the current
// prompt — an older row, a partial write, or a model that omitted a key all
// produce `undefined`, and `.join()` on it throws.
//
// Hit for real on 2026-09-11: a `company_research` row missing techStack
// crashed reviseTailoredResume with "Cannot read properties of undefined
// (reading 'join')", which surfaced to the user as a generic 500 from an
// Action Plan chip. Same failure shape as analyzeResume's
// `extracted.industries.join()` the same day.
function buildResearchContext(dossier: CompanyResearchDossier): string {
  const list = (value: unknown, fallback: string, separator = "; ") =>
    (Array.isArray(value) ? value.filter(Boolean).join(separator) : "") || fallback;

  return `Company overview: ${dossier.companyOverview ?? "Not recorded"}
Why this role: ${dossier.whyThisRole ?? "Not recorded"}
Tech stack: ${list(dossier.techStack, "Unknown", ", ")}
Culture signals: ${list(dossier.culture, "None recorded")}
Candidate's edge: ${list(dossier.yourEdge, "None recorded")}
Gaps to address: ${list(dossier.gapsToAddress, "None recorded")}`;
}

export async function generateTailoredResume({
  job,
  profile,
  dossier,
  provider,
  tier,
}: DocumentInput): Promise<GeneratedContent> {
  const raw = await complete(await getModel(provider, tier), {
    systemPrompt:
      `You are an expert resume writer producing a polished, ATS-optimized resume for one specific job application. Given the candidate's profile, the target job posting, and research about the target company, produce a professional summary and rewrite each work experience entry's responsibilities as achievement-focused bullet points.\n\nRules:\n- Summary: 2-3 sentences, specific to this candidate and role. Never open with generic resume clichés like 'results-oriented', 'proven track record', 'dynamic professional', or similar boilerplate — state concretely what the candidate does and their strongest strength for this specific role.\n- Bullets: 3-5 per role, each a single tight line (roughly 15-22 words), starting with a strong action verb. Never repeat the same opening verb across bullets in the resume. ${BULLET_QUALITY_RULES}\n- Use only standard characters and punctuation (no special symbols, emoji, or unusual unicode) so the text extracts cleanly in ATS parsers.\n- Keep total content tight enough to fit cleanly on one page for a typical candidate — favor the most relevant, highest-impact bullets over exhaustive coverage of every responsibility.\n- Never claim a skill or a piece of experience the candidate does not actually have.\n\n${HUMANIZED_WRITING_RULES}\n\nReturn only valid JSON.`,
    userPrompt: `Generate a tailored resume and return JSON matching this exact shape:
{
  "summary": "string — 2-3 sentence professional summary tailored to this role",
  "work_experience": [
    {
      "company": "string",
      "title": "string",
      "start_date": "string",
      "end_date": "string | null",
      "is_current": false,
      "bullets": ["string", "string", "string"]
    }
  ]
}

CANDIDATE PROFILE:
${buildProfileContext(profile)}

TARGET JOB POSTING:
${buildJobContext(job)}

COMPANY RESEARCH:
${buildResearchContext(dossier)}`,
    temperature: 0.6,
    // Full tailored resume JSON. Raised 4000 -> 16000 on 2026-09-11: the
    // old "maxTokens is a ceiling, not a charge" note stopped being the
    // whole story once the default model became a THINKING model, because
    // reasoning tokens bill against this same budget before any JSON is
    // emitted. A whole resume's sections is one of the largest outputs in
    // the app, and truncation here surfaces to the user as a generation
    // that silently does nothing.
    maxTokens: 16000,
    jsonResponse: true,
  });

  return JSON.parse(raw) as GeneratedContent;
}

export async function generateCoverLetter({
  job,
  profile,
  dossier,
  provider,
  tier,
}: DocumentInput): Promise<string> {
  const raw = await complete(await getModel(provider, tier), {
    systemPrompt:
      `You are a career strategist writing a cover letter for one specific candidate applying to one specific role. Ground every claim about the company in the provided research — never invent funding, customers, headcount, or facts. Choose whichever angle (mission-driven, technical-depth, culture-fit, or growth-story) best fits what the research actually supports, rather than forcing one. Structure: an opening hook connecting the candidate to something specific and real about the company or role, one to two body paragraphs connecting the candidate's actual experience to the role's needs (address a real gap honestly if one matters, don't ignore it), and a closing paragraph with a clear call to action. Keep it under 350 words, no generic filler phrases. Return only the letter body. Begin directly with the opening paragraph: do NOT write a greeting or salutation line such as "Dear Hiring Team," because the document prints the salutation itself. Sign off with the candidate's full name. No markdown, no JSON, no placeholder brackets.\n\n${HUMANIZED_WRITING_RULES}`,
    userPrompt: `CANDIDATE PROFILE:
${buildProfileContext(profile)}

TARGET JOB POSTING:
${buildJobContext(job)}

COMPANY RESEARCH:
${buildResearchContext(dossier)}`,
    temperature: 0.6,
    maxTokens: 1500,
  });

  return raw.trim();
}

// Real bug fixed 2026-08-29, direct user report: this chat "wasn't
// completely listening to the user and wasn't changing the template" —
// root cause was structural, not a prompt-quality issue: this function
// only ever saw/returned GeneratedContent (summary/bullets); ResumeStyle
// (template/theme/colors/spacing — types/resumeEditor.ts) never reached
// the model at all, so a request like "make it two-column" or "switch to
// a different template" had no field to land in. Now the model sees the
// current style and can optionally return a partial styleChanges patch —
// null on any turn that wasn't actually about visual layout, so a normal
// content-only revision never touches style.
export async function reviseTailoredResume({
  job,
  profile,
  dossier,
  provider,
  tier,
  messages,
  currentContent,
  currentStyle,
}: ReviseInput & { currentContent: GeneratedContent; currentStyle: ResumeStyle }): Promise<{
  reply: string;
  content: GeneratedContent;
  styleChanges: Partial<ResumeStyle> | null;
}> {
  const raw = await complete(await getModel(provider, tier), {
    systemPrompt:
      `You are a professional resume writer revising an already-generated resume based on the candidate's feedback. Apply the candidate's latest instruction (the last message in the conversation) to the current resume content, preserving everything they didn't ask to change. ${BULLET_QUALITY_RULES} Never claim a skill or experience the candidate does not have.

This resume also has a visual STYLE (template/theme/colors/layout), shown to you below, separate from its content. If — and only if — the candidate's latest instruction is actually about how the resume LOOKS (template, layout, columns, colors, font size, spacing, bullet style, alignment, page size), return a "styleChanges" object containing ONLY the fields that should change, using the exact same shape/allowed values as CURRENT STYLE below. If the instruction is about content (wording, what's included, phrasing) or doesn't mention appearance at all, return "styleChanges": null and leave style untouched. Valid "template" values: professional, early_career, structured, centered, split, timeline, executive, block. Valid "fontFamily" values: calibri, arial, cambria, georgia, times, garamond. Valid "theme" values: classic, modern, minimal, slate, editorial, sage.

If the candidate asks for something this resume format genuinely can't do (e.g. adding a photo, a QR code, a chart), say so plainly in "reply" rather than silently agreeing and not actually doing it.

${HUMANIZED_WRITING_RULES}

${USER_INSTRUCTION_PRECEDENCE}

Return only valid JSON with a short conversational 'reply' summarizing what you changed (or explaining what you can't do), the full revised 'content' in the same shape as the current content, and 'styleChanges' per the rule above.`,
    userPrompt: `Return JSON matching this exact shape:
{
  "reply": "string — one or two sentences confirming what you changed, or explaining what's out of scope",
  "content": {
    "summary": "string",
    "work_experience": [
      {
        "company": "string",
        "title": "string",
        "start_date": "string",
        "end_date": "string | null",
        "is_current": false,
        "bullets": ["string", "string", "string"]
      }
    ]
  },
  "styleChanges": "object with only the changed style fields, or null"
}

CANDIDATE PROFILE:
${buildProfileContext(profile)}

TARGET JOB POSTING:
${buildJobContext(job)}

COMPANY RESEARCH:
${buildResearchContext(dossier)}

CURRENT RESUME CONTENT:
${JSON.stringify(currentContent)}

CURRENT STYLE:
${JSON.stringify(currentStyle)}

CONVERSATION SO FAR (apply the latest Candidate instruction):
${buildConversationContext(messages)}`,
    temperature: 0.5,
    // Revised resume JSON — same truncation risk as generation above, and
    // this is the path behind the Action Plan chips, where a truncated
    // response was the user-visible "I pressed it and nothing happened".
    maxTokens: 16000,
    jsonResponse: true,
  });

  const parsed = JSON.parse(raw) as { reply: string; content: GeneratedContent; styleChanges?: Partial<ResumeStyle> | null };
  return { reply: parsed.reply, content: parsed.content, styleChanges: parsed.styleChanges ?? null };
}

// Same style-awareness fix as reviseTailoredResume above, direct user
// follow-up 2026-08-29 ("in resume and cover letter editor") — the cover
// letter shares the tailored résumé's exact style (CoverLetterPDF.tsx's own
// comment), so a template/theme request typed into the cover letter's own
// chat had the identical gap and needed the identical fix.
export async function reviseCoverLetter({
  job,
  profile,
  dossier,
  provider,
  tier,
  messages,
  currentContent,
  currentStyle,
}: ReviseInput & { currentContent: string; currentStyle: ResumeStyle }): Promise<{
  reply: string;
  content: string;
  styleChanges: Partial<ResumeStyle> | null;
}> {
  const raw = await complete(await getModel(provider, tier), {
    systemPrompt:
      `You are a career strategist revising an already-written cover letter based on the candidate's feedback. Apply the candidate's latest instruction (the last message in the conversation) to the current letter, preserving everything they didn't ask to change. Keep every company claim grounded in the provided research — never invent facts.

This cover letter shares its visual STYLE (template/theme/colors/layout) with the candidate's résumé, shown to you below. If — and only if — the candidate's latest instruction is actually about how the document LOOKS (template, layout, columns, colors, font size, spacing, alignment, page size), return a "styleChanges" object containing ONLY the fields that should change, using the exact same shape/allowed values as CURRENT STYLE below. If the instruction is about content (wording, what's included, phrasing) or doesn't mention appearance at all, return "styleChanges": null and leave style untouched. Valid "template" values: professional, early_career, structured, centered, split, timeline, executive, block. Valid "fontFamily" values: calibri, arial, cambria, georgia, times, garamond. Valid "theme" values: classic, modern, minimal, slate, editorial, sage.

If the candidate asks for something this format genuinely can't do, say so plainly in "reply" rather than silently agreeing and not actually doing it.

${HUMANIZED_WRITING_RULES}

Return only valid JSON with a short conversational 'reply' summarizing what you changed (or explaining what's out of scope), the full revised letter body as 'content' (no greeting or salutation line, since the document prints that itself; begins with the opening paragraph, signs off with the candidate's full name, no markdown), and 'styleChanges' per the rule above.`,
    userPrompt: `Return JSON matching this exact shape:
{
  "reply": "string — one or two sentences confirming what you changed, or explaining what's out of scope",
  "content": "string — the full revised letter body",
  "styleChanges": "object with only the changed style fields, or null"
}

CANDIDATE PROFILE:
${buildProfileContext(profile)}

TARGET JOB POSTING:
${buildJobContext(job)}

COMPANY RESEARCH:
${buildResearchContext(dossier)}

CURRENT LETTER:
${currentContent}

CURRENT STYLE:
${JSON.stringify(currentStyle)}

CONVERSATION SO FAR (apply the latest Candidate instruction):
${buildConversationContext(messages)}`,
    temperature: 0.5,
    maxTokens: 2000,
    jsonResponse: true,
  });

  const parsed = JSON.parse(raw) as { reply: string; content: string; styleChanges?: Partial<ResumeStyle> | null };
  return { reply: parsed.reply, content: parsed.content, styleChanges: parsed.styleChanges ?? null };
}
