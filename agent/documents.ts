import OpenAI from "openai";

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

// GEMINI_API_KEY, not OPENAI_API_KEY — see agent/research.ts for why.
function getModelClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.GEMINI_API_KEY!,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });
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
}: DocumentInput): Promise<GeneratedContent> {
  const openai = getModelClient();

  const response = await openai.chat.completions.create({
    model: "gemini-3.1-flash-lite",
    response_format: { type: "json_object" },
    temperature: 0.6,
    max_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "You are a professional resume writer tailoring a resume for one specific job application. Given the candidate's profile, the target job posting, and research about the target company, produce a 2-3 sentence professional summary and rewrite each work experience entry's responsibilities as 3-5 concise, achievement-focused bullet points starting with strong action verbs. Mirror the exact terminology and keywords from the job posting and its required skills wherever the candidate's real experience genuinely supports it — this is for ATS keyword matching. Never claim a skill or a piece of experience the candidate does not actually have. Return only valid JSON.",
      },
      {
        role: "user",
        content: `Generate a tailored resume and return JSON matching this exact shape:
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
      },
    ],
  });

  const raw = response.choices[0].message.content;
  if (!raw) {
    throw new Error("AI returned an empty response");
  }

  return JSON.parse(raw) as GeneratedContent;
}

export async function generateCoverLetter({
  job,
  profile,
  dossier,
}: DocumentInput): Promise<string> {
  const openai = getModelClient();

  const response = await openai.chat.completions.create({
    model: "gemini-3.1-flash-lite",
    temperature: 0.6,
    max_tokens: 700,
    messages: [
      {
        role: "system",
        content:
          "You are a career strategist writing a cover letter for one specific candidate applying to one specific role. Ground every claim about the company in the provided research — never invent funding, customers, headcount, or facts. Choose whichever angle (mission-driven, technical-depth, culture-fit, or growth-story) best fits what the research actually supports, rather than forcing one. Structure: an opening hook connecting the candidate to something specific and real about the company or role, one to two body paragraphs connecting the candidate's actual experience to the role's needs (address a real gap honestly if one matters, don't ignore it), and a closing paragraph with a clear call to action. Keep it under 350 words, no generic filler phrases. Return only the letter body — start with \"Dear Hiring Team,\" and sign off with the candidate's full name. No markdown, no JSON, no placeholder brackets.",
      },
      {
        role: "user",
        content: `CANDIDATE PROFILE:
${buildProfileContext(profile)}

TARGET JOB POSTING:
${buildJobContext(job)}

COMPANY RESEARCH:
${buildResearchContext(dossier)}`,
      },
    ],
  });

  const raw = response.choices[0].message.content;
  if (!raw) {
    throw new Error("AI returned an empty response");
  }

  return raw.trim();
}

export async function reviseTailoredResume({
  job,
  profile,
  dossier,
  messages,
  currentContent,
}: ReviseInput & { currentContent: GeneratedContent }): Promise<{
  reply: string;
  content: GeneratedContent;
}> {
  const openai = getModelClient();

  const response = await openai.chat.completions.create({
    model: "gemini-3.1-flash-lite",
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_tokens: 1300,
    messages: [
      {
        role: "system",
        content:
          "You are a professional resume writer revising an already-generated resume based on the candidate's feedback. Apply the candidate's latest instruction (the last message in the conversation) to the current resume content, preserving everything they didn't ask to change. Keep mirroring the real job posting's terminology for ATS matching, and never claim a skill or experience the candidate does not have. Return only valid JSON with a short conversational 'reply' summarizing what you changed, and the full revised 'content' in the same shape as the current content.",
      },
      {
        role: "user",
        content: `Return JSON matching this exact shape:
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
      },
    ],
  });

  const raw = response.choices[0].message.content;
  if (!raw) {
    throw new Error("AI returned an empty response");
  }

  return JSON.parse(raw) as { reply: string; content: GeneratedContent };
}

export async function reviseCoverLetter({
  job,
  profile,
  dossier,
  messages,
  currentContent,
}: ReviseInput & { currentContent: string }): Promise<{
  reply: string;
  content: string;
}> {
  const openai = getModelClient();

  const response = await openai.chat.completions.create({
    model: "gemini-3.1-flash-lite",
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content:
          "You are a career strategist revising an already-written cover letter based on the candidate's feedback. Apply the candidate's latest instruction (the last message in the conversation) to the current letter, preserving everything they didn't ask to change. Keep every company claim grounded in the provided research — never invent facts. Return only valid JSON with a short conversational 'reply' summarizing what you changed, and the full revised letter body as 'content' (same format as before — starts with 'Dear Hiring Team,', signs off with the candidate's full name, no markdown).",
      },
      {
        role: "user",
        content: `Return JSON matching this exact shape:
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
      },
    ],
  });

  const raw = response.choices[0].message.content;
  if (!raw) {
    throw new Error("AI returned an empty response");
  }

  return JSON.parse(raw) as { reply: string; content: string };
}
