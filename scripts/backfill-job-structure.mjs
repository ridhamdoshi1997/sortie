// One-off backfill for jobs evaluated before the 2026-07-24 evaluator fix
// added responsibilities/requirements/niceToHave/benefits/aboutRole/salary/
// hiringProcess extraction to lib/evaluator.ts. Extraction-only — never
// touches match_score/evaluation/matched_skills, so it's safe to run
// against already-graded jobs. Idempotent: only targets rows where
// match_score is set but about_role is still null, so re-running after a
// partial run just picks up where it left off.
//
// Paced at 4.5s between calls with real backoff on 429/503 — the free-tier
// gemini-3.1-flash-lite key this project uses is rate-limited to 15
// requests/minute (confirmed live from the actual 429 response body).
//
// Run with:
//   node --env-file=.env scripts/backfill-job-structure.mjs [limit]
import { createAdminClient } from "@insforge/sdk";

const LIMIT = Number(process.argv[2] ?? 250);

const admin = createAdminClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
  apiKey: process.env.INSFORGE_API_KEY,
});

const systemPrompt = `Extract structured, cleaned sections from a raw scraped job posting. The raw text often contains job-board/ATS boilerplate mixed in with the real posting — salary-context filler ("Market median for X roles is..."), "Resume Keywords to Include" sections, "Sign up free to auto-tailor your resume" prompts, apply-tracking IDs, near-identical Equal Opportunity/accommodation/legal disclaimer paragraphs (worded almost the same across every employer, zero per-job signal), and similar noise. Ignore all of that; extract only from the real posting content.

- aboutRole: a clean 2-4 sentence prose summary of the role and company, written properly — not a copy-paste fragment, not keyword-stuffed, no ATS boilerplate, never including EEO/accommodation disclaimer text. Base it only on real content in the posting.
- responsibilities/requirements/niceToHave/benefits: short bullet-point phrases, not full sentence rewrites. This is extraction, not generation — only include something if the posting actually states it. requirements holds only must-haves; anything phrased as a plus/nice-to-have goes in niceToHave, not both. If the posting genuinely has no benefits section, return an empty array for benefits rather than guessing typical perks.
- salary: the posting's stated compensation as a short human-readable string (e.g. "$150,000 - $180,000 CAD"), extracted directly from wherever the posting states it. If the posting genuinely states no figure, return an empty string.
- hiringProcess: the posting's interview/application process detail, if it describes one (steps, format, timeline). Short bullet-point phrases. Most postings won't have this — return an empty array rather than inventing a generic process.

Return ONLY valid JSON matching this exact shape:
{
  "aboutRole": "string",
  "responsibilities": string[],
  "requirements": string[],
  "niceToHave": string[],
  "benefits": string[],
  "salary": "string",
  "hiringProcess": string[]
}`;

async function extract(description) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-3.1-flash-lite",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: description.slice(0, 8000) },
        ],
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return JSON.parse(data.choices[0].message.content);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const { data: jobs, error } = await admin.database
  .from("jobs")
  .select("id,title,company,description,about_role,salary")
  .not("match_score", "is", null)
  .is("about_role", null)
  .limit(LIMIT);

if (error) {
  console.error("Fetch failed:", error);
  process.exit(1);
}

console.error(`Processing ${jobs.length} jobs...`);

let ok = 0;
let failed = 0;

for (const job of jobs) {
  const text = job.description ?? "";
  if (!text.trim()) {
    console.error(`SKIP ${job.id} — no description text`);
    continue;
  }

  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    try {
      const result = await extract(text);
      const { error: updateError } = await admin.database
        .from("jobs")
        .update({
          about_role: result.aboutRole || null,
          responsibilities: result.responsibilities ?? [],
          requirements: result.requirements ?? [],
          nice_to_have: result.niceToHave ?? [],
          benefits: result.benefits ?? [],
          hiring_process: result.hiringProcess ?? [],
          // Fallback only — never overwrite a real structured salary
          // already on the row.
          ...(job.salary ? {} : { salary: result.salary || null }),
        })
        .eq("id", job.id);

      if (updateError) throw new Error(JSON.stringify(updateError));

      console.error(`OK ${job.id} (${job.title ?? "?"} @ ${job.company ?? "?"})`);
      ok++;
      break;
    } catch (err) {
      const msg = String(err);
      if (attempt < 5 && (msg.includes("429") || msg.includes("503") || msg.includes("UNAVAILABLE"))) {
        const retryMatch = msg.match(/retryDelay":"(\d+)s/);
        const waitMs = retryMatch ? (Number(retryMatch[1]) + 2) * 1000 : 15000 * attempt;
        console.error(`  retry ${job.id} after ${Math.round(waitMs / 1000)}s backoff (attempt ${attempt})`);
        await sleep(waitMs);
        continue;
      }
      console.error(`FAIL ${job.id}: ${msg}`);
      failed++;
      break;
    }
  }

  await sleep(4500);
}

console.error(`Done. ok=${ok} failed=${failed}`);
