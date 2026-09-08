import { createAdminDbClient } from "@/lib/admin/client";

// Programmatic SEO pages off the real Interview Prep question banks
// (build-plan.md's Phase 19 homepage research — "Behavioral Interview
// Questions for Product Managers at Stripe" style pages). Deliberately
// reads ONLY real interview_question_banks rows, generated organically by
// real users' own question-bank requests — never fabricates a page for a
// company/role with no real data, matching this app's "never invent"
// discipline everywhere else. Uses the admin client for a public,
// unauthenticated read — this table has no anon/authenticated SELECT
// policy of its own (confirmed via the 2026-08-29 security audit's RLS
// review), and the content here is deliberately public-facing (SEO), so a
// service-role read is the correct, intentional bypass, not a workaround.

export type InterviewQuestion = { category: string; question: string; rationale: string };

export type QuestionBankEntry = {
  slug: string;
  company: string;
  roleFamily: string;
  seniority: string | null;
  questions: InterviewQuestion[];
};

// A handful of obvious test/seed rows exist in the real table from this
// app's own development — excluded from public pages by name, not by a
// database flag (none exists), since these are known, finite, and adding
// a schema column just to hide 1-2 rows would be overkill.
const EXCLUDED_COMPANIES = new Set(["testco"]);

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A real collision was found live (2026-08-30): two genuinely distinct
// Stripe/"Software Engineer" rows exist, one Senior and one unspecified-
// seniority, which produced the exact same company+role slug and silently
// hid the second one behind .find()'s first-match. Seniority is now part
// of the slug so these stay distinct.
function toEntrySlug(company: string, roleFamily: string, seniority: string | null): string {
  const parts = [slugify(company), slugify(roleFamily)];
  if (seniority) parts.push(slugify(seniority));
  return parts.join("--");
}

// This page is statically prerendered, so this query runs at BUILD time, and
// Next.js gives a page 60 seconds to render before it fails the whole build.
// That turned a slow database into a broken deploy (2026-09-08): the read has
// no timeout of its own, so when the database was saturated the prerender hung
// until Next killed it, and `npm run build` exited 1. Worse, it was exactly the
// deploy carrying the fix for the saturation -- a database too slow to answer
// blocked shipping the change that would have let it recover.
//
// A marketing page is not worth that. The query is bounded, and any failure
// degrades to zero entries -- which the page already renders honestly as "No
// question banks published yet". `revalidate = 3600` means an empty build-time
// render repairs itself on the next revalidation without a redeploy.
const ENTRY_FETCH_TIMEOUT_MS = 15_000;

async function fetchAllEntries(): Promise<QuestionBankEntry[]> {
  const client = createAdminDbClient();

  const query = client.database
    .from("interview_question_banks")
    .select("company,role_family,seniority,questions")
    .returns<{ company: string; role_family: string; seniority: string | null; questions: InterviewQuestion[] }[]>();

  type Row = { company: string; role_family: string; seniority: string | null; questions: InterviewQuestion[] };
  let data: Row[] | null = null;
  try {
    const settled = await Promise.race([
      query,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${ENTRY_FETCH_TIMEOUT_MS}ms`)), ENTRY_FETCH_TIMEOUT_MS),
      ),
    ]);
    // Logged, not swallowed: the error was previously destructured away
    // entirely, so a failing read was indistinguishable from an empty table.
    if (settled.error) {
      console.warn(`[interviewSeo] question bank read failed: ${settled.error.message}`);
    }
    data = (settled.data ?? null) as Row[] | null;
  } catch (error) {
    console.warn(`[interviewSeo] question bank read unavailable: ${(error as Error).message}`);
    data = null;
  }

  const seenSlugs = new Map<string, number>();

  return (data ?? [])
    .filter((row) => !EXCLUDED_COMPANIES.has(row.company.trim().toLowerCase()))
    .map((row) => {
      const seniority = row.seniority && row.seniority !== "unspecified" ? row.seniority : null;
      const baseSlug = toEntrySlug(row.company, row.role_family, seniority);
      // Fallback for any remaining exact triple-match (e.g. a genuine
      // re-generation duplicate) — degrades to "one extra URL" rather than
      // a second silently-hidden entry.
      const occurrence = seenSlugs.get(baseSlug) ?? 0;
      seenSlugs.set(baseSlug, occurrence + 1);
      const slug = occurrence === 0 ? baseSlug : `${baseSlug}-${occurrence + 1}`;

      return {
        slug,
        company: row.company,
        roleFamily: row.role_family,
        seniority,
        questions: row.questions ?? [],
      };
    });
}

export async function listQuestionBankEntries(): Promise<QuestionBankEntry[]> {
  return fetchAllEntries();
}

export async function getQuestionBankEntryBySlug(slug: string): Promise<QuestionBankEntry | null> {
  const all = await fetchAllEntries();
  return all.find((entry) => entry.slug === slug) ?? null;
}
