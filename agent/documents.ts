import { complete, getModel, type ModelProvider } from "@/lib/models";
import type { CompanyResearchDossier, Job, Profile } from "@/types";
import type { GeneratedContent } from "@/app/api/resume/generate/ResumePDF";

type DocumentJob = Pick<
  Job,
  "title" | "company" | "about_role" | "matched_skills" | "missing_skills"
>;

type DocumentInput = {
  job: DocumentJob;
  profile: Profile;
  dossier: CompanyResearchDossier;
  provider: ModelProvider;
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
Matched skills: ${job.matched_skills.join(", ") || "None recorded"}
Missing skills: ${job.missing_skills.join(", ") || "None recorded"}`;
}

function buildResearchContext(dossier: CompanyResearchDossier): string {
  return `Company overview: ${dossier.companyOverview}
Why this role: ${dossier.whyThisRole}
Tech stack: ${dossier.techStack.join(", ") || "Unknown"}
Culture signals: ${dossier.culture.join("; ") || "None recorded"}
Candidate's edge: ${dossier.yourEdge.join("; ") || "None recorded"}
Gaps to address: ${dossier.gapsToAddress.join("; ") || "None recorded"}`;
}

export async function generateTailoredResume({
  job,
  profile,
  dossier,
  provider,
}: DocumentInput): Promise<GeneratedContent> {
  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt:
      "You are an expert resume writer producing a polished, ATS-optimized resume for one specific job application. Given the candidate's profile, the target job posting, and research about the target company, produce a professional summary and rewrite each work experience entry's responsibilities as achievement-focused bullet points.\n\nRules:\n- Summary: 2-3 sentences, specific to this candidate and role. Never open with generic resume clichés like 'results-oriented', 'proven track record', 'dynamic professional', or similar boilerplate — state concretely what the candidate does and their strongest strength for this specific role.\n- Bullets: 3-5 per role, each a single tight line (roughly 15-22 words), starting with a strong action verb. Never repeat the same opening verb across bullets in the resume. Quantify impact (scale, time saved, performance gain, team size) whenever the candidate's real experience supports a number — never invent a metric that isn't grounded in their profile.\n- Mirror the exact terminology and keywords from the job posting and its required skills wherever the candidate's real experience genuinely supports it — this is for ATS keyword matching.\n- Use only standard characters and punctuation (no special symbols, emoji, or unusual unicode) so the text extracts cleanly in ATS parsers.\n- Keep total content tight enough to fit cleanly on one page for a typical candidate — favor the most relevant, highest-impact bullets over exhaustive coverage of every responsibility.\n- Never claim a skill or a piece of experience the candidate does not actually have.\n\nReturn only valid JSON.",
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
    // Full tailored resume JSON — 1200 truncated on longer work histories.
    // maxTokens is a ceiling, not a charge.
    maxTokens: 4000,
    jsonResponse: true,
  });

  return JSON.parse(raw) as GeneratedContent;
}

export async function generateCoverLetter({
  job,
  profile,
  dossier,
  provider,
}: DocumentInput): Promise<string> {
  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt:
      "You are a career strategist writing a cover letter for one specific candidate applying to one specific role. Ground every claim about the company in the provided research — never invent funding, customers, headcount, or facts. Choose whichever angle (mission-driven, technical-depth, culture-fit, or growth-story) best fits what the research actually supports, rather than forcing one. Structure: an opening hook connecting the candidate to something specific and real about the company or role, one to two body paragraphs connecting the candidate's actual experience to the role's needs (address a real gap honestly if one matters, don't ignore it), and a closing paragraph with a clear call to action. Keep it under 350 words, no generic filler phrases. Return only the letter body — start with \"Dear Hiring Team,\" and sign off with the candidate's full name. No markdown, no JSON, no placeholder brackets.",
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

export async function reviseTailoredResume({
  job,
  profile,
  dossier,
  provider,
  messages,
  currentContent,
}: ReviseInput & { currentContent: GeneratedContent }): Promise<{
  reply: string;
  content: GeneratedContent;
}> {
  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt:
      "You are a professional resume writer revising an already-generated resume based on the candidate's feedback. Apply the candidate's latest instruction (the last message in the conversation) to the current resume content, preserving everything they didn't ask to change. Keep mirroring the real job posting's terminology for ATS matching, and never claim a skill or experience the candidate does not have. Return only valid JSON with a short conversational 'reply' summarizing what you changed, and the full revised 'content' in the same shape as the current content.",
    userPrompt: `Return JSON matching this exact shape:
{
  "reply": "string — one or two sentences confirming what you changed",
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
  }
}

CANDIDATE PROFILE:
${buildProfileContext(profile)}

TARGET JOB POSTING:
${buildJobContext(job)}

COMPANY RESEARCH:
${buildResearchContext(dossier)}

CURRENT RESUME CONTENT:
${JSON.stringify(currentContent)}

CONVERSATION SO FAR (apply the latest Candidate instruction):
${buildConversationContext(messages)}`,
    temperature: 0.5,
    // Revised resume JSON — same truncation risk as generation above.
    maxTokens: 4000,
    jsonResponse: true,
  });

  return JSON.parse(raw) as { reply: string; content: GeneratedContent };
}

export async function reviseCoverLetter({
  job,
  profile,
  dossier,
  provider,
  messages,
  currentContent,
}: ReviseInput & { currentContent: string }): Promise<{
  reply: string;
  content: string;
}> {
  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt:
      "You are a career strategist revising an already-written cover letter based on the candidate's feedback. Apply the candidate's latest instruction (the last message in the conversation) to the current letter, preserving everything they didn't ask to change. Keep every company claim grounded in the provided research — never invent facts. Return only valid JSON with a short conversational 'reply' summarizing what you changed, and the full revised letter body as 'content' (same format as before — starts with 'Dear Hiring Team,', signs off with the candidate's full name, no markdown).",
    userPrompt: `Return JSON matching this exact shape:
{
  "reply": "string — one or two sentences confirming what you changed",
  "content": "string — the full revised letter body"
}

CANDIDATE PROFILE:
${buildProfileContext(profile)}

TARGET JOB POSTING:
${buildJobContext(job)}

COMPANY RESEARCH:
${buildResearchContext(dossier)}

CURRENT LETTER:
${currentContent}

CONVERSATION SO FAR (apply the latest Candidate instruction):
${buildConversationContext(messages)}`,
    temperature: 0.5,
    maxTokens: 2000,
    jsonResponse: true,
  });

  return JSON.parse(raw) as { reply: string; content: string };
}
