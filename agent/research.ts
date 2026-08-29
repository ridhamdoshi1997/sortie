import { z } from "zod";

import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";
import type {
  CompanyLeader,
  CompanyResearchDossier,
  ConnectionPerson,
  Education,
  InsiderConnections,
  Job,
  Profile,
  WorkExperience,
} from "@/types";

type ResearchLogLevel = "info" | "success" | "warning" | "error";

type ResearchLogger = (input: {
  message: string;
  level: ResearchLogLevel;
}) => Promise<void>;

type ResearchProfile = Pick<
  Profile,
  | "current_title"
  | "experience_level"
  | "years_experience"
  | "skills"
  | "work_experience"
  | "education"
>;

type ResearchJob = Pick<
  Job,
  | "id"
  | "title"
  | "company"
  | "source_url"
  | "external_apply_url"
  | "about_role"
  | "matched_skills"
  | "missing_skills"
>;

type ResearchInput = {
  job: ResearchJob;
  profile: ResearchProfile;
  log?: ResearchLogger;
  provider?: ModelProvider;
  tier?: ModelTier;
};

type ResearchResult =
  | { success: true; dossier: CompanyResearchDossier }
  | { success: false; error: string };

type PageResearch = {
  url: string;
  keyPoints: string[];
  technologies: string[];
  valuesOrCulture: string[];
  notable: string[];
};

type BrowserResearch = {
  homepageUrl: string | null;
  // False whenever no real page was actually fetched (Jina fetch failure,
  // extraction failure, etc.) — homepageUrl in that case is only a
  // *guessed* URL from the company name, never a browsed page.
  // synthesizeDossier must never let the model cite it as a source, and
  // must know to rely on the job posting alone rather than treating this
  // as real company research.
  visited: boolean;
  oneLiner: string | null;
  productSummary: string | null;
  signals: string[];
  pages: PageResearch[];
  sources: string[];
};

const MAX_SUB_PAGES = 3;
// Jina Reader is documented at ~7.9s typical latency; give real headroom
// before treating a page as unreachable rather than just slow.
const JINA_TIMEOUT_MS = 25000;
const REDIRECT_RESOLVE_TIMEOUT_MS = 10000;
// Bound how much of a fetched page's markdown gets sent to the LLM — pages
// can be very long, and this is meant to run on the cheap/fast tier.
const MAX_MARKDOWN_CHARS = 12000;

const jobBoardHosts = [
  "adzuna.com",
  "greenhouse.io",
  "lever.co",
  "workdayjobs.com",
  "myworkdayjobs.com",
  "ashbyhq.com",
  "workable.com",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "bamboohr.com",
];

const homepageContentSchema = z.object({
  oneLiner: z.string().optional().default(""),
  productSummary: z.string().optional().default(""),
  signals: z.array(z.string()).optional().default([]),
});

const subPageSchema = z.object({
  keyPoints: z.array(z.string()).optional().default([]),
  technologies: z.array(z.string()).optional().default([]),
  valuesOrCulture: z.array(z.string()).optional().default([]),
  notable: z.array(z.string()).optional().default([]),
});

const dossierSchema = z.object({
  companyOverview: z.string().min(1),
  industryTags: z.array(z.string()).default([]),
  techStack: z.array(z.string()).default([]),
  culture: z.array(z.string()).default([]),
  whyThisRole: z.string().min(1),
  yourEdge: z.array(z.string()).default([]),
  gapsToAddress: z.array(z.string()).default([]),
  smartQuestions: z.array(z.string()).default([]),
  interviewPrep: z.array(z.string()).default([]),
  recentUpdates: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
});

const leadershipSchema = z.object({
  leadershipTeam: z
    .array(z.object({ name: z.string().min(1), title: z.string().min(1) }))
    .optional()
    .default([]),
});

const LEADERSHIP_PATH_GUESSES = [
  "/about",
  "/about-us",
  "/team",
  "/leadership",
  "/company/team",
  "/company/leadership",
  "/our-team",
];

// Keyword-based, not AI-driven — cheap and deterministic. Replaces what used
// to be Stagehand's own DOM-aware link discovery; markdown from Jina Reader
// still preserves anchors as `[text](url)`, so a regex pass over the text
// plus the link's own href is enough signal to classify it.
const PAGE_KIND_KEYWORDS: Array<{ kind: string; patterns: RegExp[] }> = [
  { kind: "about", patterns: [/\babout\b/i] },
  { kind: "team", patterns: [/\bteam\b/i, /\bleadership\b/i, /\bpeople\b/i] },
  { kind: "blog", patterns: [/\bblog\b/i, /\bnews\b/i, /\bpress\b/i] },
  { kind: "engineering", patterns: [/\bengineering\b/i, /\btech\b/i] },
  { kind: "product", patterns: [/\bproduct\b/i, /\bfeatures\b/i] },
  { kind: "careers", patterns: [/\bcareers?\b/i, /\bjobs\b/i] },
];

function cleanCompanyName(companyName: string | null): string {
  return (companyName ?? "company")
    // \s+ (not \s*) — requires a real preceding space, so this only strips
    // a trailing legal-suffix WORD ("Affirm Inc" -> "Affirm"). Without it
    // this matched "co" inside plain company names with no legal suffix at
    // all — "Scotiabank" contains "co" and got truncated to just "S".
    .replace(/\s+(Inc\.?|LLC|Ltd\.?|Corp\.?|Corporation|Company|Co\.?)\s*.*$/i, "")
    .replace(/\s*[-–—|].*$/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim();
}

function fallbackHomepageUrl(companyName: string | null): string {
  const cleanName = cleanCompanyName(companyName)
    .toLowerCase()
    .replace(/\s+/g, "");

  return `https://www.${cleanName || "company"}.com`;
}

function getRootDomain(hostname: string): string {
  const parts = hostname.replace(/^www\./, "").split(".").filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(".");
  }

  const secondLevel = parts.at(-2);
  const topLevel = parts.at(-1);
  const commonCountrySecondLevels = ["ac", "co", "com", "gov", "net", "org"];

  if (
    secondLevel &&
    topLevel &&
    topLevel.length === 2 &&
    commonCountrySecondLevels.includes(secondLevel)
  ) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

function isKnownJobBoard(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "");
  return jobBoardHosts.some((jobBoardHost) => host.endsWith(jobBoardHost));
}

async function log(
  logger: ResearchLogger | undefined,
  message: string,
  level: ResearchLogLevel,
): Promise<void> {
  if (!logger) return;

  try {
    await logger({ message, level });
  } catch (error) {
    console.error("[agent/research] log", error);
  }
}

async function resolveHomepageUrl(
  job: ResearchJob,
  logger: ResearchLogger | undefined,
): Promise<string> {
  const candidateUrl = job.external_apply_url ?? job.source_url;
  const fallbackUrl = fallbackHomepageUrl(job.company);

  if (!candidateUrl) {
    return fallbackUrl;
  }

  try {
    // Native fetch follows redirects by default — job-board apply links are
    // usually a redirect chain ending at the employer's real ATS/homepage.
    const response = await fetch(candidateUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(REDIRECT_RESOLVE_TIMEOUT_MS),
    });

    const finalUrl = new URL(response.url);
    if (isKnownJobBoard(finalUrl.hostname)) {
      return fallbackUrl;
    }

    return `https://${getRootDomain(finalUrl.hostname)}`;
  } catch (error) {
    await log(
      logger,
      "Could not resolve the employer site from the job redirect. Falling back to the company name.",
      "warning",
    );
    console.error("[agent/research] resolveHomepageUrl", error);
    return fallbackUrl;
  }
}

function normalizeInternalUrl(url: string, homepageUrl: string): string | null {
  try {
    const normalized = new URL(url, homepageUrl);
    const homepage = new URL(homepageUrl);
    if (getRootDomain(normalized.hostname) !== getRootDomain(homepage.hostname)) {
      return null;
    }

    return normalized.toString();
  } catch {
    return null;
  }
}

function rankPageKind(kind: string): number {
  const priority = ["about", "blog", "engineering", "product", "team", "careers"];
  const index = priority.indexOf(kind);
  return index === -1 ? priority.length : index;
}

function classifyLink(text: string, url: string): string {
  const haystack = `${text} ${url}`;
  for (const { kind, patterns } of PAGE_KIND_KEYWORDS) {
    if (patterns.some((pattern) => pattern.test(haystack))) {
      return kind;
    }
  }
  return "other";
}

function extractMarkdownLinks(markdown: string): Array<{ text: string; url: string }> {
  const links: Array<{ text: string; url: string }> = [];
  const linkPattern = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(markdown)) !== null) {
    links.push({ text: match[1], url: match[2] });
  }

  return links;
}

// Google actively CAPTCHA-blocks Jina Reader's requests to
// google.com/search result pages when they come from cloud/datacenter IPs
// (confirmed live from this app's own Vercel deployment, 2026-08-12) — the
// block page itself is ~1000 characters, well past a plain length check, so
// a length threshold alone can't distinguish "real search results" from
// "Google's block wall." Any caller that scrapes a Google search URL via
// fetchViaJinaReader must run its result through this before trusting it as
// real content — see researchStrategicMoat/researchInterviewerBackground.
function looksLikeSearchBlockPage(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("unusual traffic") || lower.includes("maybe requiring captcha");
}

// Jina Reader (r.jina.ai) renders the page in a real browser on their
// infrastructure and returns clean markdown — no browser to host ourselves,
// genuinely free at this app's volume (10M free tokens with an API key,
// or a lower-rate-limited keyless tier). Replaces Browserbase/Stagehand as
// the "get real content off a JS-rendered page" step.
export async function fetchViaJinaReader(url: string): Promise<string | null> {
  const jinaKey = process.env.JINA_API_KEY;
  const headers: Record<string, string> = { Accept: "text/plain" };
  if (jinaKey) {
    headers.Authorization = `Bearer ${jinaKey}`;
  }

  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    return text.trim() || null;
  } catch (error) {
    console.error("[agent/research] fetchViaJinaReader", url, error);
    return null;
  }
}

// Fallback/co-search path, added 2026-07-28: when Jina Reader can't fetch a
// real page (dead homepage guess, JS-only site Jina still can't render,
// robots block, etc.), ask Perplexity's Sonar model to search the live web
// directly instead of giving up and falling through to the generic
// job-posting-only dossier. Real cost, confirmed live: ~$0.005/call (a flat
// per-request web-search fee, tokens are negligible on top) — this is why
// it's a fallback, not a first-choice replacement for the free Jina+Gemini
// path (explicit product decision, not a technical limitation).
//
// Uses Perplexity's native API directly (not routed through OpenRouter or
// lib/models.ts's getModel/complete) because the thing this needs —
// top-level `citations: string[]` on the raw response, confirmed live to
// exist alongside `choices` — is a Perplexity-specific field outside the
// OpenAI-compatible chat-completions shape complete() normalizes to. The
// returned text is deliberately NOT trusted as pre-structured JSON; it's
// run through the same extractStructured() used for Jina markdown so there
// is exactly one place in this file that has to safely turn "some text
// from the web" into a validated shape.
async function fetchViaPerplexity(
  query: string,
): Promise<{ text: string; citations: string[] } | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: query }],
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(JINA_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error("[agent/research] fetchViaPerplexity", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    const text: string | undefined = data.choices?.[0]?.message?.content;
    if (!text?.trim()) return null;

    const citations: string[] = Array.isArray(data.citations) ? data.citations : [];
    return { text, citations };
  } catch (error) {
    console.error("[agent/research] fetchViaPerplexity", error);
    return null;
  }
}

// Shared structured-extraction step: given real fetched markdown, ask
// Gemini's fast/cheap tier for a specific JSON shape. Always Gemini,
// regardless of the synthesis provider the user picked — same design as
// before (previously Stagehand's own browsing model), kept intentionally
// cheap since this can run several times per research pass.
// shapeDescription must spell out the exact JSON keys expected — the Zod
// schema only validates the model's output after the fact, it never tells
// the model what shape to produce. Without this, Gemini returns a plausible
// but differently-shaped JSON (e.g. a bare array instead of
// {"leadershipTeam": [...]}), safeParse silently fails, and the caller sees
// "nothing found" even though the model found real data. Confirmed live:
// this exact failure mode hit the leadership lookup — Gemini correctly
// found Scotiabank's CEO/CFO from Wikipedia but returned a bare array,
// which leadershipSchema's object shape rejected.
async function extractStructured<T>(
  markdown: string,
  instruction: string,
  schema: z.ZodType<T>,
  shapeDescription: string,
): Promise<T | null> {
  if (!markdown.trim()) return null;

  const systemPrompt = `${instruction}

Return ONLY valid JSON matching this exact shape:
${shapeDescription}

If the page has none of the requested content, return the schema's empty/default values — never invent facts not present in the page content.`;

  try {
    const raw = await complete(await getModel("gemini", "fast"), {
      systemPrompt,
      userPrompt: markdown.slice(0, MAX_MARKDOWN_CHARS),
      temperature: 0.2,
      maxTokens: 800,
      jsonResponse: true,
    });

    const parsed: unknown = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch (error) {
    console.error("[agent/research] extractStructured", error);
    return null;
  }
}

// Tries the Perplexity fallback (see fetchViaPerplexity's comment) when the
// free Jina+Gemini path came up empty. Returns null if Perplexity isn't
// configured, or genuinely found nothing either — caller falls through to
// emptyResearch exactly as before this existed.
async function tryPerplexityFallback(
  job: ResearchJob,
  homepageUrl: string,
  logger: ResearchLogger | undefined,
): Promise<BrowserResearch | null> {
  const company = job.company ?? "this company";
  const perplexity = await fetchViaPerplexity(
    `What does ${company} do? Describe their product/service, who it's for, and any concrete signals worth knowing before a job interview: funding, scale, notable customers, mission, and recent news or launches.`,
  );
  if (!perplexity) return null;

  const homepage = await extractStructured(
    perplexity.text,
    "This is a web-search summary about a company. Capture what the company actually does, who it's for, and any concrete signals (funding, customers, scale, mission, recent launches).",
    homepageContentSchema,
    `{ "oneLiner": string, "productSummary": string, "signals": string[] }`,
  );

  if (!homepage || (!homepage.oneLiner && !homepage.productSummary)) {
    return null;
  }

  await log(logger, "Filled in company research via Perplexity web search.", "success");

  return {
    homepageUrl,
    visited: true,
    oneLiner: homepage.oneLiner || null,
    productSummary: homepage.productSummary || null,
    signals: homepage.signals,
    pages: [],
    sources: perplexity.citations,
  };
}

async function collectBrowserResearch(
  job: ResearchJob,
  logger: ResearchLogger | undefined,
): Promise<BrowserResearch> {
  const homepageUrl = await resolveHomepageUrl(job, logger);
  const emptyResearch: BrowserResearch = {
    homepageUrl,
    visited: false,
    oneLiner: null,
    productSummary: null,
    signals: [],
    pages: [],
    sources: [],
  };

  if (!process.env.GEMINI_API_KEY) {
    await log(
      logger,
      "Company research skipped because Gemini is not configured.",
      "warning",
    );
    return emptyResearch;
  }

  const homepageMarkdown = await fetchViaJinaReader(homepageUrl);
  if (!homepageMarkdown) {
    await log(
      logger,
      "Could not fetch the company homepage directly. Trying a Perplexity web search instead.",
      "warning",
    );
    return (await tryPerplexityFallback(job, homepageUrl, logger)) ?? emptyResearch;
  }

  const homepage = await extractStructured(
    homepageMarkdown,
    "This is a company's homepage. Capture what the company actually does, who it's for, and any concrete signals (funding, customers, scale, mission, recent launches).",
    homepageContentSchema,
    `{ "oneLiner": string, "productSummary": string, "signals": string[] }`,
  );

  if (!homepage || (!homepage.oneLiner && !homepage.productSummary)) {
    await log(
      logger,
      "Homepage extraction did not find meaningful content. Trying a Perplexity web search instead.",
      "warning",
    );
    return (await tryPerplexityFallback(job, homepageUrl, logger)) ?? emptyResearch;
  }

  const research: BrowserResearch = {
    homepageUrl,
    visited: true,
    oneLiner: homepage.oneLiner || null,
    productSummary: homepage.productSummary || null,
    signals: homepage.signals,
    pages: [],
    sources: [homepageUrl],
  };

  const subPageUrls = extractMarkdownLinks(homepageMarkdown)
    .flatMap(({ text, url }) => {
      const normalized = normalizeInternalUrl(url, homepageUrl);
      if (!normalized) return [];
      const kind = classifyLink(text, normalized);
      return kind === "other" ? [] : [{ kind, url: normalized }];
    })
    .sort((a, b) => rankPageKind(a.kind) - rankPageKind(b.kind))
    .filter(
      (pageLink, index, allLinks) =>
        allLinks.findIndex((candidate) => candidate.url === pageLink.url) ===
        index,
    )
    .slice(0, MAX_SUB_PAGES);

  for (const subPage of subPageUrls) {
    const subPageMarkdown = await fetchViaJinaReader(subPage.url);
    if (!subPageMarkdown) {
      await log(
        logger,
        `Skipped a company sub-page that could not be fetched: ${subPage.url}`,
        "warning",
      );
      continue;
    }

    const pageResearch = await extractStructured(
      subPageMarkdown,
      "Extract substance that helps a candidate understand this company before applying: what they do, their values and how they work, the specific technologies and tools they use, notable projects or customers, and how the team operates. Ignore nav, footers, cookie banners, and generic marketing copy.",
      subPageSchema,
      `{ "keyPoints": string[], "technologies": string[], "valuesOrCulture": string[], "notable": string[] }`,
    );

    if (!pageResearch) continue;

    const hasContent =
      pageResearch.keyPoints.length > 0 ||
      pageResearch.technologies.length > 0 ||
      pageResearch.valuesOrCulture.length > 0 ||
      pageResearch.notable.length > 0;

    if (hasContent) {
      research.pages.push({
        url: subPage.url,
        keyPoints: pageResearch.keyPoints,
        technologies: pageResearch.technologies,
        valuesOrCulture: pageResearch.valuesOrCulture,
        notable: pageResearch.notable,
      });
      research.sources.push(subPage.url);
    }
  }

  return research;
}

function getWorkHistory(workExperience: WorkExperience[] | null): string {
  if (!workExperience || workExperience.length === 0) {
    return "No work history saved.";
  }

  return JSON.stringify(workExperience);
}

function buildFallbackDossier(
  job: ResearchJob,
  profile: ResearchProfile,
): CompanyResearchDossier {
  const company = job.company ?? "this company";
  const title = job.title ?? "this role";
  const skills = profile.skills.slice(0, 5);

  return {
    companyOverview: `Research was limited, so this briefing is based on the saved job posting for ${company}.`,
    industryTags: [],
    recentUpdates: [],
    leadershipTeam: [],
    techStack: [...(job.matched_skills ?? []), ...(job.missing_skills ?? [])].slice(0, 8),
    culture: [
      "Use the job posting language to infer how the team collaborates and what outcomes they value.",
    ],
    whyThisRole: `${company} is hiring for ${title}, likely to add capacity around the responsibilities described in the job posting.`,
    yourEdge:
      skills.length > 0
        ? [`Lead with your experience in ${skills.join(", ")}.`]
        : ["Lead with the strongest examples from your recent work."],
    gapsToAddress:
      (job.missing_skills ?? []).length > 0
        ? (job.missing_skills ?? []).map(
            (skill) =>
              `Prepare an honest story for ${skill}, connecting it to adjacent experience you already have.`,
          )
        : ["Prepare a clear story about how your background maps to the role."],
    smartQuestions: [
      `What would success look like for the ${title} role in the first 90 days?`,
      "Which parts of the product or platform would this role influence most directly?",
    ],
    interviewPrep: [
      "Review the saved job description and prepare examples for each major responsibility.",
      "Prepare concise stories that connect your strongest skills to the role requirements.",
    ],
    sources: [],
  };
}

async function synthesizeDossier(
  job: ResearchJob,
  profile: ResearchProfile,
  browserResearch: BrowserResearch,
  provider: ModelProvider,
  tier: ModelTier,
): Promise<CompanyResearchDossier> {
  const systemPrompt = `You are a sharp career strategist preparing a candidate to apply for a specific role. You are given (a) research collected from the company's own website, (b) the job posting, and (c) the candidate's profile. Produce a concise, concrete briefing that gives this specific candidate an edge for this specific role.

Rules:
- Ground every company claim in the provided research or job posting. Never invent funding, customers, headcount, or facts. If research was thin, infer carefully from the job posting and say what's inferred.
- "sources" must ONLY list a URL if the research below marks it as actually visited (visited: true). If visited is false, return an empty sources array — do NOT cite the homepageUrl or any other URL, even though one is shown to you for context. Citing a page nobody actually fetched is worse than citing nothing.
- Be specific to THIS candidate. Connect their actual skills and past work to this company's stack, product, and values. No generic advice that would apply to anyone.
- Turn the candidate's missing skills into a strategy: how to frame the gap honestly and what adjacent experience to lean on.
- Talking points and questions must reference real things from the research, the kind of detail that signals the candidate did their homework.
- Keep every item tight: one or two sentences. No fluff.

Return ONLY valid JSON matching this shape:
{
  "companyOverview": string,
  "industryTags": string[] (2-4 short industry/sector labels for this company, e.g. "Fintech", "B2B SaaS" - grounded in the research and job posting, never invented),
  "techStack": string[],
  "culture": string[],
  "whyThisRole": string,
  "yourEdge": string[],
  "gapsToAddress": string[],
  "smartQuestions": string[],
  "interviewPrep": string[],
  "recentUpdates": string[] (0-3 concrete recent developments - launches, milestones, blog posts, press mentions - ONLY if actually present in the provided research; return an empty array rather than inventing one),
  "sources": string[]
}`;

  const userPrompt = `COMPANY RESEARCH:
${
  browserResearch.visited
    ? `Real pages were browsed for this company. Data below is genuine, from a real crawl:\n${JSON.stringify(browserResearch)}`
    : `No page was actually browsed for this company (browser research was unavailable). The homepageUrl below is only a GUESS from the company name, never fetched — do not cite it or treat anything here as verified: ${JSON.stringify(browserResearch)}`
}

JOB POSTING:
Title: ${job.title ?? "Unknown"}
Company: ${job.company ?? "Unknown"}
Description: ${job.about_role ?? "No saved description"}
Matched skills: ${(job.matched_skills ?? []).join(", ") || "None recorded"}
Missing skills: ${(job.missing_skills ?? []).join(", ") || "None recorded"}

CANDIDATE PROFILE:
Current title: ${profile.current_title ?? "Unknown"}
Experience: ${profile.years_experience ?? "Unknown"} years, level ${profile.experience_level ?? "Unknown"}
Skills: ${(profile.skills ?? []).join(", ") || "None saved"}
Work history: ${getWorkHistory(profile.work_experience)}`;

  const raw = await complete(await getModel(provider, tier), {
    systemPrompt,
    userPrompt,
    temperature: 0.4,
    maxTokens: 1200,
    jsonResponse: true,
  });

  try {
    const parsed: unknown = JSON.parse(raw);
    const result = dossierSchema.safeParse(parsed);

    if (!result.success) {
      console.error("[agent/research] dossier validation failed", result.error);
      return buildFallbackDossier(job, profile);
    }

    const fallback = buildFallbackDossier(job, profile);

    return {
      companyOverview: result.data.companyOverview,
      industryTags: result.data.industryTags,
      recentUpdates: result.data.recentUpdates,
      leadershipTeam: [],
      techStack:
        result.data.techStack.length > 0
          ? result.data.techStack
          : fallback.techStack,
      culture:
        result.data.culture.length > 0 ? result.data.culture : fallback.culture,
      whyThisRole: result.data.whyThisRole,
      yourEdge:
        result.data.yourEdge.length > 0
          ? result.data.yourEdge
          : fallback.yourEdge,
      gapsToAddress:
        result.data.gapsToAddress.length > 0
          ? result.data.gapsToAddress
          : fallback.gapsToAddress,
      smartQuestions:
        result.data.smartQuestions.length > 0
          ? result.data.smartQuestions
          : fallback.smartQuestions,
      interviewPrep:
        result.data.interviewPrep.length > 0
          ? result.data.interviewPrep
          : fallback.interviewPrep,
      // Deterministic, not prompt-dependent: nothing was actually fetched
      // when !visited, so there is nothing real to cite — never trust the
      // model's own "sources" output in that case, no matter what it says.
      sources: browserResearch.visited
        ? result.data.sources.length > 0
          ? result.data.sources
          : browserResearch.sources
        : [],
    };
  } catch (error) {
    console.error("[agent/research] dossier JSON parse failed", error);
    return buildFallbackDossier(job, profile);
  }
}

const PROVIDER_ENV_KEYS: Record<ModelProvider, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

type LeadershipResult =
  | { success: true; leadershipTeam: CompanyLeader[] }
  | { success: false; error: string };

// Wikipedia's plain search on a short/generic company name can match an
// unrelated article (e.g. "Affirm" -> "Affirmation") — appending "company"
// consistently disambiguates without needing a fancier search API.
// Verified live: "Affirm company" and "Cisco company" both correctly
// surfaced the real company article as the top result.
async function findWikipediaArticleTitle(companyName: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `${companyName} company`,
    format: "json",
    srlimit: "1",
  });

  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": "Sortie/1.0 (job search app; company research)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;

    const data = await response.json();
    return data.query?.search?.[0]?.title ?? null;
  } catch (error) {
    console.error("[agent/research] findWikipediaArticleTitle", error);
    return null;
  }
}

// Free, no API key. Best for large/well-known companies — Wikipedia's
// "Infobox company" carries a "Key people" field almost every notable
// company article has. Verified live against Scotiabank (real CEO/CFO
// names) and Meridian Credit Union (real CEO name); correctly returns
// nothing for companies with no Wikipedia coverage.
async function fetchWikipediaLeadership(
  companyName: string,
  logger: ResearchLogger | undefined,
): Promise<CompanyLeader[] | null> {
  const title = await findWikipediaArticleTitle(companyName);
  if (!title) return null;

  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  const markdown = await fetchViaJinaReader(url);
  if (!markdown) return null;

  const extracted = await extractStructured(
    markdown,
    `This is a Wikipedia article. First confirm it is actually about the company "${companyName}" and not an unrelated topic that happens to share the name — if it's not about that company, return an empty list. Otherwise extract the name and title of every executive or key person actually listed (e.g. the infobox "Key people" field, or a leadership section).`,
    leadershipSchema,
    `{ "leadershipTeam": [{ "name": string, "title": string }] }`,
  );

  if (extracted && extracted.leadershipTeam.length > 0) {
    await log(logger, `Found leadership info on Wikipedia (${title}).`, "success");
    return extracted.leadershipTeam;
  }

  return null;
}

// Free, no API key — best for smaller/startup companies with a simple site
// structure (verified live: Affirm's /about page). Tries every guess
// concurrently (see the comment on the old sequential version this
// replaced — worst case was minutes, this is one timeout window).
async function fetchGuessedPageLeadership(
  homepageUrl: string,
): Promise<CompanyLeader[] | null> {
  const candidateUrls = LEADERSHIP_PATH_GUESSES.flatMap((path) => {
    const url = normalizeInternalUrl(path, homepageUrl);
    return url ? [url] : [];
  });

  const attempts = await Promise.all(
    candidateUrls.map(async (candidateUrl) => {
      const markdown = await fetchViaJinaReader(candidateUrl);
      if (!markdown) return null;

      const extracted = await extractStructured(
        markdown,
        "This may be a company's About/Team/Leadership page. Extract the name and title of every executive or leadership team member actually listed on this page. Return an empty list if this page has no leadership roster — never invent a name.",
        leadershipSchema,
        `{ "leadershipTeam": [{ "name": string, "title": string }] }`,
      );

      return extracted && extracted.leadershipTeam.length > 0
        ? extracted.leadershipTeam
        : null;
    }),
  );

  // Promise.all preserves input order, so this still respects
  // LEADERSHIP_PATH_GUESSES' priority order regardless of which resolved first.
  return attempts.find((attempt) => attempt !== null) ?? null;
}

const APIFY_API_BASE = "https://api.apify.com/v2";
// CXO only — verified live against Scotiabank (87k employees): adding
// VP/Director ("310"/"300") matched 5,687 people, and the top result was a
// mid-level department director, not company leadership. CXO alone is what
// "leadership team" actually means at this scale.
const LEADERSHIP_SENIORITY_IDS = ["220"];

async function runApifyActor(
  actorSlug: string,
  input: Record<string, unknown>,
): Promise<unknown[] | null> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return null;

  try {
    const response = await fetch(
      `${APIFY_API_BASE}/acts/${actorSlug}/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(90000),
      },
    );

    if (!response.ok) {
      console.error("[agent/research] Apify actor error", actorSlug, response.status);
      return null;
    }

    const data = await response.json();
    return Array.isArray(data) ? data : null;
  } catch (error) {
    console.error("[agent/research] runApifyActor", actorSlug, error);
    return null;
  }
}

// Paid last resort (~$0.10-0.11/company; not free) — only runs when
// APIFY_API_TOKEN is configured and both free sources above found nothing.
// Real, current LinkedIn data via HarvestAPI's actors: resolve the
// company's LinkedIn URL, then search people currently there at CXO
// seniority. Field mapping verified live against a real Scotiabank run —
// the actor's actual response shape is firstName/lastName (no combined
// name field), currentPositions[0].title (nested, not a flat field), and
// pictureUrl (not profilePicture).
async function fetchApifyLinkedInLeadership(
  companyName: string,
  logger: ResearchLogger | undefined,
): Promise<CompanyLeader[] | null> {
  if (!process.env.APIFY_API_TOKEN) return null;

  await log(logger, "Free sources found nothing — searching LinkedIn (paid lookup).", "info");

  const companyResults = await runApifyActor("harvestapi~linkedin-company", {
    searches: [companyName],
  });

  const firstCompany = companyResults?.[0] as Record<string, unknown> | undefined;
  const companyUrl =
    (firstCompany?.linkedinUrl as string | undefined) ??
    (firstCompany?.url as string | undefined) ??
    (firstCompany?.companyUrl as string | undefined) ??
    null;

  if (!companyUrl) {
    await log(logger, "Could not resolve a LinkedIn company page.", "warning");
    return null;
  }

  const profileResults = await runApifyActor("harvestapi~linkedin-profile-search", {
    currentCompanies: [companyUrl],
    seniorityLevelIds: LEADERSHIP_SENIORITY_IDS,
    profileScraperMode: "Short",
    maxItems: 6,
  });

  if (!profileResults || profileResults.length === 0) return null;

  const leaders: CompanyLeader[] = profileResults
    .map((raw): CompanyLeader | null => {
      const p = raw as Record<string, unknown>;
      const firstName = p.firstName as string | undefined;
      const lastName = p.lastName as string | undefined;
      const name = firstName && lastName ? `${firstName} ${lastName}` : undefined;

      const positions = p.currentPositions as Array<{ title?: string }> | undefined;
      const title = positions?.[0]?.title;

      const linkedinUrl = p.linkedinUrl as string | undefined;
      const photoUrl = p.pictureUrl as string | undefined;

      if (!name || !title) return null;
      return { name, title, linkedinUrl, photoUrl };
    })
    .filter((leader): leader is CompanyLeader => leader !== null)
    .slice(0, 6);

  // LinkedIn's own "CXO" seniority tag is noisier than the name implies at
  // large companies — verified live: Scotiabank's CXO-tagged results were
  // department-level Managing Directors ("Managing Director / Sales and
  // Trading", "Director Human Resources..."), not the actual C-suite.
  // Require the title to actually read like an executive title; if none
  // do, treat this as "not found" rather than showing misleading noise
  // labeled as the company's leadership team.
  const executiveTitled = leaders.filter((leader) =>
    /\b(chief|ceo|cfo|coo|cto|cmo|president|founder|chair(person|man)?)\b/i.test(leader.title),
  );

  if (executiveTitled.length > 0) {
    await log(logger, "Found leadership info via LinkedIn.", "success");
    return executiveTitled;
  }

  return null;
}

// Deliberately a separate, opt-in-only lookup (not folded into
// collectBrowserResearch/synthesizeDossier's auto-populated flow) — a
// candidate explicitly asks for this via its own button, rather than it
// running silently on every job view. Waterfall, cheapest first: Wikipedia
// and site-guessing run in parallel (both free); only if neither finds
// anything does it fall back to the paid Apify/LinkedIn lookup, and only
// when a token is actually configured.
export async function researchLeadershipTeam(
  job: ResearchJob,
  logger: ResearchLogger | undefined,
): Promise<LeadershipResult> {
  if (!process.env.GEMINI_API_KEY) {
    return { success: false, error: "Leadership lookup is not configured." };
  }

  try {
    const company = job.company ?? "this company";
    const homepageUrl = await resolveHomepageUrl(job, logger);

    const [wikipediaTeam, guessedTeam] = await Promise.all([
      fetchWikipediaLeadership(company, logger),
      fetchGuessedPageLeadership(homepageUrl),
    ]);

    const freeResult = wikipediaTeam?.length ? wikipediaTeam : guessedTeam;
    if (freeResult && freeResult.length > 0) {
      return { success: true, leadershipTeam: freeResult };
    }

    const apifyTeam = await fetchApifyLinkedInLeadership(company, logger);
    if (apifyTeam && apifyTeam.length > 0) {
      return { success: true, leadershipTeam: apifyTeam };
    }

    await log(logger, "No public leadership roster was found.", "warning");
    return { success: true, leadershipTeam: [] };
  } catch (error) {
    console.error("[agent/research] researchLeadershipTeam", error);
    return { success: false, error: "Leadership lookup failed." };
  }
}

type ConnectionsResult =
  | { success: true; connections: InsiderConnections }
  | { success: false; error: string };

type EmailLookupResult =
  | { success: true; email: string | null; name: string | null }
  | { success: false; error: string };

// Resolves a plain company name to its real LinkedIn company URL — needed
// because harvestapi's people-search filters require full LinkedIn URLs,
// not plain names. Same actor/field name already verified live during the
// Leadership work (`.linkedinUrl`).
async function resolveCompanyLinkedInUrl(companyName: string): Promise<string | null> {
  const results = await runApifyActor("harvestapi~linkedin-company", {
    searches: [companyName],
  });

  const first = results?.[0] as Record<string, unknown> | undefined;
  return (first?.linkedinUrl as string | undefined) ?? null;
}

// Same field-mapping already verified live against Scotiabank for
// Leadership (firstName/lastName, nested currentPositions[0].title,
// pictureUrl) — reused as-is, no new field-name guessing here.
function mapConnectionResults(raw: unknown[]): ConnectionPerson[] {
  return raw
    .map((item): ConnectionPerson | null => {
      const p = item as Record<string, unknown>;
      const firstName = p.firstName as string | undefined;
      const lastName = p.lastName as string | undefined;

      const positions = p.currentPositions as Array<{ title?: string }> | undefined;
      const title = positions?.[0]?.title;

      const linkedinUrl = p.linkedinUrl as string | undefined;
      const photoUrl = p.pictureUrl as string | undefined;

      if (!firstName || !lastName || !title) return null;
      return { name: `${firstName} ${lastName}`, firstName, lastName, title, linkedinUrl, photoUrl };
    })
    .filter((person): person is ConnectionPerson => person !== null)
    .slice(0, 6);
}

async function findConnectionsByCompany(
  jobCompanyUrl: string,
  pastEmployerUrl: string,
): Promise<ConnectionPerson[]> {
  const results = await runApifyActor("harvestapi~linkedin-profile-search", {
    currentCompanies: [jobCompanyUrl],
    pastCompanies: [pastEmployerUrl],
    profileScraperMode: "Short",
    maxItems: 6,
  });

  return results ? mapConnectionResults(results) : [];
}

async function findConnectionsBySchool(
  jobCompanyUrl: string,
  school: string,
): Promise<ConnectionPerson[]> {
  const results = await runApifyActor("harvestapi~linkedin-profile-search", {
    currentCompanies: [jobCompanyUrl],
    schools: [school],
    profileScraperMode: "Short",
    maxItems: 6,
  });

  return results ? mapConnectionResults(results) : [];
}

async function findConnectionsBeyondNetwork(jobCompanyUrl: string): Promise<ConnectionPerson[]> {
  const results = await runApifyActor("harvestapi~linkedin-profile-search", {
    currentCompanies: [jobCompanyUrl],
    profileScraperMode: "Short",
    maxItems: 6,
  });

  return results ? mapConnectionResults(results) : [];
}

// Only the single most recent past employer, not several — searching
// multiple past employers in one filter would make it impossible to
// honestly attribute *which* employer a given match actually shares
// (the "Short" profile mode doesn't return full work history to check),
// and this app doesn't display a fact it can't actually verify.
function getMostRecentPastEmployer(workExperience: WorkExperience[] | null): string | null {
  if (!workExperience) return null;

  const past = workExperience
    .filter((entry) => !entry.is_current && entry.company)
    .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));

  return past[0]?.company ?? null;
}

// Insider Connections' school bucket only supports one search term (each is a
// paid Apify call — fanning out to every degree would multiply the ~$0.31/
// lookup cost), so pick a single school the same way past employer is picked:
// most recent first, falling back to array order when graduation_year is missing.
function getMostRecentEducationInstitution(education: Education[] | null): string | null {
  if (!education) return null;

  const withInstitution = education.filter((entry) => entry.institution);
  const sorted = [...withInstitution].sort((a, b) =>
    (b.graduation_year ?? "").localeCompare(a.graduation_year ?? ""),
  );

  return sorted[0]?.institution ?? null;
}

// Deliberately opt-in only, same as Leadership — a real, paid lookup
// (~$0.31-0.32/call: 3 people-search pages + up to 3 company-URL resolves),
// never run automatically. Three buckets, matching JobRight's own layout:
// broad "who works here," people who share the candidate's most recent past
// employer, and people who share their school.
export async function researchInsiderConnections(
  job: ResearchJob,
  profile: ResearchProfile,
  logger: ResearchLogger | undefined,
): Promise<ConnectionsResult> {
  if (!process.env.APIFY_API_TOKEN) {
    return { success: false, error: "Insider connections lookup is not configured." };
  }

  try {
    const companyName = job.company ?? "this company";
    const jobCompanyUrl = await resolveCompanyLinkedInUrl(companyName);

    if (!jobCompanyUrl) {
      await log(logger, "Could not resolve a LinkedIn company page.", "warning");
      return {
        success: true,
        connections: { beyondNetwork: [], previousCompany: [], school: [] },
      };
    }

    const pastEmployerName = getMostRecentPastEmployer(profile.work_experience);
    const school = getMostRecentEducationInstitution(profile.education);

    const pastEmployerUrl = pastEmployerName
      ? await resolveCompanyLinkedInUrl(pastEmployerName)
      : null;

    const [beyondNetwork, previousCompanyRaw, schoolConnections] = await Promise.all([
      findConnectionsBeyondNetwork(jobCompanyUrl),
      pastEmployerUrl ? findConnectionsByCompany(jobCompanyUrl, pastEmployerUrl) : Promise.resolve([]),
      school ? findConnectionsBySchool(jobCompanyUrl, school) : Promise.resolve([]),
    ]);

    const previousCompany: ConnectionPerson[] = previousCompanyRaw.map((person) => ({
      ...person,
      pastEmployer: pastEmployerName ?? undefined,
    }));

    const total = beyondNetwork.length + previousCompany.length + schoolConnections.length;
    await log(
      logger,
      total > 0
        ? `Found ${total} potential connection${total === 1 ? "" : "s"} at ${companyName}.`
        : `No connections found at ${companyName}.`,
      total > 0 ? "success" : "warning",
    );

    return {
      success: true,
      connections: {
        beyondNetwork,
        previousCompany,
        school: schoolConnections,
        companyLinkedinUrl: jobCompanyUrl,
      },
    };
  } catch (error) {
    console.error("[agent/research] researchInsiderConnections", error);
    return { success: false, error: "Insider connections lookup failed." };
  }
}

// Displays a found email for the candidate to use themselves — Sortie never
// sends anything on their behalf. Not persisted anywhere (see the dossier
// type comment); the candidate copies it and the response is discarded.
//
// Not URL-based — the originally planned dev_fusion actor supports that,
// but is blocked on Apify's free plan for API calls ("Users on the free
// Apify plan can run the actor through the UI and not via other methods",
// confirmed live). HarvestAPI's own search actor can do email enrichment
// too, but it's filter-based, not URL-based — so this searches by the
// person's known first/last name + current company (already known from the
// connections search that surfaced them) instead of a pasted URL. Verified
// live: `profileScraperMode: "Full + email search"` returns a real
// `emails[]` array (e.g. a real result had `{ email, status: "risky",
// qualityScore }` — these are best-effort matched addresses, not guaranteed
// deliverable, and the UI should not overclaim certainty).
export async function findEmailForPerson(
  firstName: string,
  lastName: string,
  companyLinkedinUrl: string,
): Promise<EmailLookupResult> {
  if (!process.env.APIFY_API_TOKEN) {
    return { success: false, error: "Email lookup is not configured." };
  }

  try {
    const results = await runApifyActor("harvestapi~linkedin-profile-search", {
      firstNames: [firstName],
      lastNames: [lastName],
      currentCompanies: [companyLinkedinUrl],
      profileScraperMode: "Full + email search",
      maxItems: 1,
    });

    const first = results?.[0] as Record<string, unknown> | undefined;
    if (!first) {
      return { success: false, error: "No profile data found for this person." };
    }

    const emails = first.emails as Array<{ email?: string }> | undefined;
    const email = emails?.[0]?.email ?? null;

    return { success: true, email, name: `${firstName} ${lastName}` };
  } catch (error) {
    console.error("[agent/research] findEmailForPerson", error);
    return { success: false, error: "Email lookup failed." };
  }
}

// Strategic Moat Briefing — a distinct lens from researchCompany's culture/
// tech-stack dossier: recent news, current strategic priorities, and
// existential threats/challenges, plus CEO-level questions grounded in
// that. Real news synthesis genuinely needs a live search (there's no page
// to crawl before you know what's newsworthy), unlike the homepage-crawl
// pattern researchCompany starts with — so this tries a free Jina-Reader
// fetch of a search-results page first, and only falls to the existing
// Perplexity path (real ~$0.005/call, already used elsewhere in this file
// for the same "free path came up empty" reason) if that's too thin.
export type StrategicMoatBriefing = {
  strategicPriorities: string[];
  existentialThreats: string[];
  smartQuestions: string[];
  sources: string[];
};

const strategicMoatSchema = z.object({
  strategicPriorities: z.array(z.string()).optional().default([]),
  existentialThreats: z.array(z.string()).optional().default([]),
  smartQuestions: z.array(z.string()).optional().default([]),
});

export async function researchStrategicMoat(
  job: ResearchJob,
  logger?: ResearchLogger,
): Promise<{ success: true; briefing: StrategicMoatBriefing } | { success: false; error: string }> {
  try {
    const company = job.company ?? "this company";

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      `${company} recent news strategic priorities 2026`,
    )}`;
    let sourceText = await fetchViaJinaReader(searchUrl);
    let sources: string[] = [];

    // Same "free path too thin, try Perplexity" threshold reasoning as
    // tryPerplexityFallback above — a search page that mostly failed to
    // render still returns *some* text, so a length floor catches that.
    // Also checks for Google's own CAPTCHA block page, which is verbose
    // enough to sail past a plain length check on its own.
    if (!sourceText || sourceText.length < 200 || looksLikeSearchBlockPage(sourceText)) {
      const perplexity = await fetchViaPerplexity(
        `What are ${company}'s current strategic priorities, recent news, and any existential threats or business challenges they're facing right now? Be specific and current, not generic.`,
      );
      if (perplexity) {
        sourceText = perplexity.text;
        sources = perplexity.citations;
        await log(logger, "Strategic moat briefing filled in via Perplexity web search.", "success");
      }
    }

    if (!sourceText) {
      return { success: false, error: "Could not find recent information about this company." };
    }

    const briefing = await extractStructured(
      sourceText,
      "This is real search/news content about a company. Extract their current strategic priorities, existential threats or business challenges, and 2-3 sharp, specific interview questions a candidate could ask that would signal genuine research (not generic questions). Ground every item in the actual content given — never invent a priority, threat, or fact not present in the source text. Empty arrays are fine if the content doesn't support a section.",
      strategicMoatSchema,
      `{ "strategicPriorities": string[], "existentialThreats": string[], "smartQuestions": string[] }`,
    );

    if (!briefing || (briefing.strategicPriorities.length === 0 && briefing.existentialThreats.length === 0)) {
      return { success: false, error: "Could not extract a grounded briefing from available sources." };
    }

    await log(logger, "Strategic moat briefing generated.", "success");
    return { success: true, briefing: { ...briefing, sources } };
  } catch (error) {
    console.error("[agent/research] researchStrategicMoat", error);
    return { success: false, error: "Strategic moat research failed." };
  }
}

// Interview Panel Topology — a named-person version of the same free-first-
// then-Perplexity pattern researchStrategicMoat uses (not the company-
// leadership Wikipedia waterfall below, which is the wrong shape for a
// private individual who almost never has Wikipedia coverage). The name
// comes from the candidate themselves (they were told who's interviewing
// them) — this is the same normal, legitimate practice as looking someone
// up on LinkedIn before a call, not surveillance of a stranger. Extraction
// is deliberately conservative: genuinely public professional facts only,
// never speculation about personality, bias, or anything not grounded in
// real fetched content.
export type InterviewerBackground = {
  summary: string;
  priorCompanies: string[];
  interviewPrepNote: string;
  sources: string[];
};

const interviewerBackgroundSchema = z.object({
  summary: z.string().optional().default(""),
  priorCompanies: z.array(z.string()).optional().default([]),
  interviewPrepNote: z.string().optional().default(""),
});

export async function researchInterviewerBackground(
  name: string,
  company: string,
): Promise<{ success: true; background: InterviewerBackground } | { success: false; error: string }> {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`"${name}" "${company}" LinkedIn`)}`;
    let sourceText = await fetchViaJinaReader(searchUrl);
    let sources: string[] = [];

    // See looksLikeSearchBlockPage's comment — Google's CAPTCHA wall is
    // verbose enough to pass a plain length check on its own.
    if (!sourceText || sourceText.length < 200 || looksLikeSearchBlockPage(sourceText)) {
      const perplexity = await fetchViaPerplexity(
        `What is ${name}'s public professional background at ${company}? Focus only on their real career history — prior companies, role, and area of expertise. Do not speculate about personality or private details.`,
      );
      if (perplexity) {
        sourceText = perplexity.text;
        sources = perplexity.citations;
      }
    }

    if (!sourceText) {
      return { success: false, error: "No public professional information found for this person." };
    }

    const background = await extractStructured(
      sourceText,
      "This is real search content about a specific named professional. Extract only genuinely public professional facts: a short career summary, prior companies/roles, and one practical interview-prep note connecting their background to what to expect (e.g. an engineering background suggesting a technical interview). Never speculate about personality, bias, or anything not grounded in the actual content given. If the content doesn't clearly match this specific person at this specific company, return empty values rather than guessing.",
      interviewerBackgroundSchema,
      `{ "summary": string, "priorCompanies": string[], "interviewPrepNote": string }`,
    );

    if (!background || !background.summary) {
      return { success: false, error: "Could not find enough public information about this person." };
    }

    return { success: true, background: { ...background, sources } };
  } catch (error) {
    console.error("[agent/research] researchInterviewerBackground", error);
    return { success: false, error: "Interviewer research failed." };
  }
}

export async function researchCompany({
  job,
  profile,
  log: logger,
  provider = "gemini",
  tier = "smart",
}: ResearchInput): Promise<ResearchResult> {
  try {
    // Page-fetch + extraction always runs through Gemini regardless of the
    // synthesis provider chosen below — cheap and consistent, same design
    // as before this ran through Stagehand's own model.
    if (!process.env.GEMINI_API_KEY) {
      return {
        success: false,
        error: "Gemini is not configured for company research.",
      };
    }

    if (!process.env[PROVIDER_ENV_KEYS[provider]]) {
      return {
        success: false,
        error: `${provider} is not configured for dossier synthesis.`,
      };
    }

    const browserResearch = await collectBrowserResearch(job, logger);
    const dossier = await synthesizeDossier(job, profile, browserResearch, provider, tier);

    await log(logger, "Company research dossier generated.", "success");
    return { success: true, dossier };
  } catch (error) {
    console.error("[agent/research]", error);
    await log(logger, "Company research failed.", "error");
    return { success: false, error: "Failed to research company" };
  }
}
