import { createAdminDbClient } from "@/lib/admin/client";
import { complete, getModel } from "@/lib/models";
import { normalizeRoleFamily } from "@/lib/interviewQuestions";

// Programmatic SEO/GEO content engine (Phase 18 item 1, context/RESUME.md).
// Aggregates real, already-collected job data across ALL users into
// anonymous counts only (role family, average match score, most-common
// skills) — never a user_id, email, or per-user identifying field. This is
// the first cross-user aggregate query in the app; every field it selects
// is already broadly non-identifying job-posting metadata (title, scores,
// skill tags), not personal data.
const MIN_SAMPLE_SIZE = 5;
const RECENT_JOBS_WINDOW = 800;

export type GeoTopic = {
  roleFamily: string;
  slug: string;
  jobCount: number;
  avgMatchScore: number | null;
  topSkills: string[];
};

function slugifyRoleFamily(roleFamily: string): string {
  return `job-market-${roleFamily
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

// Picks the highest-volume role family that has real sample size and does
// NOT already have a generated GEO page — so the cron never regenerates the
// same topic. Returns null when there's nothing left worth writing about
// (too little data, or every well-sampled topic is already covered).
export async function findGeoContentTopic(): Promise<GeoTopic | null> {
  const admin = createAdminDbClient();

  const { data: rawJobs } = await admin.database
    .from("jobs")
    .select("title,match_score,matched_skills")
    .not("title", "is", null)
    .order("found_at", { ascending: false })
    .limit(RECENT_JOBS_WINDOW);

  const jobs = (rawJobs ?? []) as { title: string; match_score: number | null; matched_skills: string[] | null }[];
  if (jobs.length === 0) return null;

  const byFamily = new Map<string, { count: number; scoreSum: number; scoreCount: number; skillCounts: Map<string, number> }>();

  for (const job of jobs) {
    const family = normalizeRoleFamily(job.title);
    if (!family) continue;
    const bucket = byFamily.get(family) ?? { count: 0, scoreSum: 0, scoreCount: 0, skillCounts: new Map<string, number>() };
    bucket.count += 1;
    if (typeof job.match_score === "number") {
      bucket.scoreSum += job.match_score;
      bucket.scoreCount += 1;
    }
    for (const skill of job.matched_skills ?? []) {
      bucket.skillCounts.set(skill, (bucket.skillCounts.get(skill) ?? 0) + 1);
    }
    byFamily.set(family, bucket);
  }

  const { data: existingPages } = await admin.database.from("pages").select("slug").eq("content_source", "ai_geo");
  const existingSlugs = new Set(((existingPages ?? []) as { slug: string }[]).map((p) => p.slug));

  const candidates = Array.from(byFamily.entries())
    .map(([roleFamily, bucket]) => ({
      roleFamily,
      slug: slugifyRoleFamily(roleFamily),
      jobCount: bucket.count,
      avgMatchScore: bucket.scoreCount > 0 ? Math.round(bucket.scoreSum / bucket.scoreCount) : null,
      topSkills: Array.from(bucket.skillCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([skill]) => skill),
    }))
    .filter((c) => c.jobCount >= MIN_SAMPLE_SIZE && !existingSlugs.has(c.slug))
    .sort((a, b) => b.jobCount - a.jobCount);

  return candidates[0] ?? null;
}

const GEO_SYSTEM_PROMPT = `You are writing a programmatic SEO / Generative Engine Optimization (GEO) page for Sortie, a job-search copilot. This page targets both traditional search AND AI answer engines (ChatGPT, Perplexity, Gemini overviews) — write in a clear, directly extractable style: short declarative sentences, real headers, genuine Q&A pairs an AI overview could quote verbatim.

Ground every claim ONLY in the real aggregate data provided — job posting counts, average fit scores, and in-demand skills observed across this app's own users' searches. Never invent salary figures, company names, hiring statistics, or trends not present in the data. If the data is thin on a point, say so plainly rather than filling the gap with a generic claim.

Structure (Markdown):
1. A one-paragraph overview of what the data shows for this role family.
2. "## What's In Demand" — the real top skills list, as a short paragraph plus a bullet list.
3. "## How Competitive Is This Market" — interpret the average match/fit score honestly (this measures how well typical candidate profiles fit these postings, not job-market difficulty broadly — be precise about that distinction).
4. "## Frequently Asked Questions" — 3-4 real Q&A pairs a job seeker would ask, each answer grounded in the data or general honest guidance, formatted as "**Q: ...**" then the answer.
5. A brief closing paragraph mentioning Sortie's AI job-fit evaluation as a next step, without overselling.

Output ONLY the Markdown body (no title heading — it's supplied separately), no frontmatter, no commentary before/after.`;

export async function generateGeoPageDraft(topic: GeoTopic): Promise<{ title: string; bodyMarkdown: string; metaTitle: string; metaDescription: string }> {
  const dataSummary = `Role family: ${topic.roleFamily}
Job postings observed: ${topic.jobCount}
Average candidate fit score across these postings: ${topic.avgMatchScore !== null ? `${topic.avgMatchScore}%` : "not enough scored postings yet"}
Most frequently required skills (by observed frequency): ${topic.topSkills.length > 0 ? topic.topSkills.join(", ") : "no consistent pattern observed yet"}`;

  const bodyMarkdown = await complete(getModel("gemini", "smart"), {
    systemPrompt: GEO_SYSTEM_PROMPT,
    userPrompt: dataSummary,
    temperature: 0.5,
    maxTokens: 1600,
  });

  const title = `${topic.roleFamily} Job Market Report`;
  return {
    title,
    bodyMarkdown: bodyMarkdown.trim(),
    metaTitle: `${title} — Real Demand & Skills Data | Sortie`,
    metaDescription: `What ${topic.jobCount} real ${topic.roleFamily} job postings reveal about in-demand skills and candidate fit — data-backed, updated by Sortie.`,
  };
}

// Runs the full pick-topic -> draft -> insert flow. Called from the Inngest
// function (lib/inngest/functions.ts) on both its cron trigger and its
// manual admin-triggered event. Returns null (and writes nothing) when
// there's no fresh topic left to cover — never errors on "nothing to do".
export async function generateAndQueueGeoPage(): Promise<{ pageId: string; slug: string } | null> {
  const topic = await findGeoContentTopic();
  if (!topic) return null;

  const draft = await generateGeoPageDraft(topic);
  const admin = createAdminDbClient();

  const { data, error } = await admin.database
    .from("pages")
    .insert([
      {
        slug: topic.slug,
        title: draft.title,
        body_markdown: draft.bodyMarkdown,
        meta_title: draft.metaTitle,
        meta_description: draft.metaDescription,
        status: "draft",
        content_source: "ai_geo",
      },
    ])
    .select("id,slug")
    .single<{ id: string; slug: string }>();

  if (error || !data) {
    throw new Error(`Failed to queue GEO page for topic "${topic.roleFamily}": ${error?.message}`);
  }

  return { pageId: data.id, slug: data.slug };
}
