import { createAdminDbClient, createCacheDbClient } from "@/lib/admin/client";
import { toCompanyKey } from "@/lib/atsRegistry";
import { withBuildTimeout } from "@/lib/buildTimeFetch";

// Data assembly for the redesigned /interview-questions hub. Two real
// sources, never a third invented one:
//   1. interview_question_banks — AI-generated, on-demand, per real user
//      request (lib/interviewSeo.ts already reads this for the per-role SEO
//      pages; this file re-reads it at the company level for the hub grid).
//   2. contributed_interview_questions — human-submitted, real candidates
//      reporting a real question they were actually asked
//      (actions/interviewContributions.ts).
//
// A handful of well-known companies are used to give the grid initial
// STRUCTURE (section headers a browsing candidate would recognise), but
// every number shown against them is real: real active-posting counts from
// the same crawl cache /find-jobs draws from, real question counts from the
// two tables above. A curated company with zero real signal in every source
// is dropped rather than shown with fabricated zeros dressed up as content —
// see CURATED_COMPANIES's own comment for exactly which were verified live
// and which were cut for having no real coverage.

export type InterviewCompanyCard = {
  companyKey: string;
  companyName: string;
  domain: string | null;
  activePostings: number;
  aiQuestionCount: number;
  contributedQuestionCount: number;
  totalQuestions: number;
  mostRecentActivity: string | null;
};

export type InterviewHubSection = {
  name: string;
  companies: InterviewCompanyCard[];
};

export type InterviewHubData = {
  sections: InterviewHubSection[];
  stats: { companies: number; totalQuestions: number; last30Days: number };
};

// Verified live against the real crawl cache (2026-09-10) before being
// listed here — every name below genuinely has active postings in
// discovered_postings under this exact company_key. Names tried and CUT for
// having no real coverage in our own crawl (Apple, Amazon, Netflix,
// Microsoft, Stripe, Robinhood, Databricks, Goldman Sachs, JPMorgan,
// Shopify, LinkedIn, Uber, Visa): either they don't publish on the ATS
// platforms this app crawls, or the only matches were unrelated companies
// sharing a substring of the name (e.g. "Apple Roofing"). Re-verify against
// live data before adding to this list — don't extend it on name
// recognition alone.
const CURATED_COMPANIES: { name: string; section: string }[] = [
  { name: "Google", section: "Big Tech" },
  { name: "Meta", section: "Big Tech" },
  { name: "NVIDIA", section: "Big Tech" },
  { name: "Salesforce", section: "Big Tech" },
  { name: "OpenAI", section: "AI Frontier" },
  { name: "Anthropic", section: "AI Frontier" },
  { name: "xAI", section: "AI Frontier" },
  { name: "Coinbase", section: "Finance & High-Growth" },
  { name: "Airbnb", section: "Finance & High-Growth" },
];

const SECTION_ORDER = ["Big Tech", "AI Frontier", "Finance & High-Growth", "More real questions"];
const FALLBACK_SECTION = "More real questions";
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type Accumulator = {
  companyKey: string;
  companyName: string;
  section: string;
  aiQuestionCount: number;
  contributedQuestionCount: number;
  mostRecentActivity: string | null;
};

// A bank row's `questions` is a jsonb array of individual questions. Anything
// unexpected counts as zero rather than throwing — a malformed row should not
// take down the whole stat strip.
function questionCount(questions: unknown[] | null): number {
  return Array.isArray(questions) ? questions.length : 0;
}

function newer(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() > new Date(b).getTime() ? a : b;
}

export async function getInterviewHubData(): Promise<InterviewHubData> {
  const acc = new Map<string, Accumulator>();
  let last30Days = 0;

  for (const c of CURATED_COMPANIES) {
    const key = toCompanyKey(c.name);
    acc.set(key, {
      companyKey: key,
      companyName: c.name,
      section: c.section,
      aiQuestionCount: 0,
      contributedQuestionCount: 0,
      mostRecentActivity: null,
    });
  }

  const admin = createAdminDbClient();

  // AI-generated banks, read directly rather than through
  // lib/interviewSeo.ts's listQuestionBankEntries() — that function shapes
  // rows for the per-role SEO page (slugs, questions array); this only
  // needs company + when, aggregated per company.
  const banksResult = await withBuildTimeout<{ company: string; generated_at: string; questions: unknown[] | null }[]>(
    "interviewHub:question-banks",
    async () => {
      const { data, error } = await admin.database
        .from("interview_question_banks")
        .select("company,generated_at,questions")
        .returns<{ company: string; generated_at: string; questions: unknown[] | null }[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    [],
  );

  const now = Date.now();
  for (const row of banksResult) {
    if (!row.company) continue;
    const key = toCompanyKey(row.company);
    const existing = acc.get(key);
    if (existing) {
      existing.aiQuestionCount += 1;
      existing.mostRecentActivity = newer(existing.mostRecentActivity, row.generated_at);
    } else {
      acc.set(key, {
        companyKey: key,
        companyName: row.company,
        section: FALLBACK_SECTION,
        aiQuestionCount: 1,
        contributedQuestionCount: 0,
        mostRecentActivity: row.generated_at,
      });
    }
    // Counts the QUESTIONS inside the bank, not the bank row. Each bank holds
    // 10-15 real questions, so counting rows under-reported the feed by an
    // order of magnitude — the panel read "3 Real Questions" while the three
    // banks on file actually held 36 (verified against the table, 2026-09-10).
    if (row.generated_at && now - new Date(row.generated_at).getTime() <= RECENT_WINDOW_MS) {
      last30Days += questionCount(row.questions);
    }
  }

  const contributedResult = await withBuildTimeout<{ company: string; company_key: string; created_at: string }[]>(
    "interviewHub:contributed",
    async () => {
      const { data, error } = await admin.database
        .from("contributed_interview_questions")
        .select("company,company_key,created_at")
        .returns<{ company: string; company_key: string; created_at: string }[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    [],
  );

  for (const row of contributedResult) {
    const key = row.company_key || toCompanyKey(row.company);
    const existing = acc.get(key);
    if (existing) {
      existing.contributedQuestionCount += 1;
      existing.mostRecentActivity = newer(existing.mostRecentActivity, row.created_at);
    } else {
      acc.set(key, {
        companyKey: key,
        companyName: row.company,
        section: FALLBACK_SECTION,
        aiQuestionCount: 0,
        contributedQuestionCount: 1,
        mostRecentActivity: row.created_at,
      });
    }
    if (row.created_at && now - new Date(row.created_at).getTime() <= RECENT_WINDOW_MS) last30Days += 1;
  }

  // Real active-posting counts + logo domain, from the same cache project
  // /find-jobs draws from — a genuine trust/differentiation signal the
  // static competitor page can't show (a company can be a great source of
  // question data and no longer be hiring; this ties the two together).
  const keys = [...acc.keys()];
  const postingCounts = new Map<string, number>();
  const domains = new Map<string, string>();

  if (keys.length > 0) {
    const cache = createCacheDbClient();
    // One exact HEAD count per company, not a single bulk row fetch counted
    // client-side — found live (2026-09-10): a bulk `.select("company_key")`
    // across all curated keys hit PostgREST's default 1000-row response cap,
    // and OpenAI alone (780 active postings) blew that budget on its own,
    // silently starving every company whose rows didn't make the cut (Meta,
    // NVIDIA, Salesforce all read back as zero and got dropped by the
    // zero-signal filter below, even though they have real active postings).
    // `count: "exact", head: true` never transfers rows, so it isn't subject
    // to that cap — one request per key, run in parallel, is both correct
    // and cheap at this list's size (curated + organic keys, a few dozen at
    // most).
    await Promise.all(
      keys.map(async (key) => {
        const { count, error } = await cache.database
          .from("discovered_postings")
          .select("*", { count: "exact", head: true })
          .eq("company_key", key)
          .eq("is_active", true);
        if (error) {
          console.error("[interviewHub] posting count lookup failed", key, error.message);
          return;
        }
        postingCounts.set(key, count ?? 0);
      }),
    );

    const { data: domainRows, error: domainError } = await cache.database
      .from("company_domains")
      .select("company_key,domain")
      .in("company_key", keys);
    if (domainError) {
      console.error("[interviewHub] domain lookup failed", domainError.message);
    } else {
      for (const row of (domainRows ?? []) as { company_key: string; domain: string }[]) {
        if (row.domain) domains.set(row.company_key, row.domain);
      }
    }
  }

  const bySection = new Map<string, InterviewCompanyCard[]>();
  for (const entry of acc.values()) {
    const totalQuestions = entry.aiQuestionCount + entry.contributedQuestionCount;
    // A curated company with zero real signal anywhere (no postings, no
    // questions) is dropped rather than shown as an empty shell — see this
    // file's header comment. An organic (non-curated) company always has
    // at least one real question by construction, so it always qualifies.
    const activePostings = postingCounts.get(entry.companyKey) ?? 0;
    const isCurated = CURATED_COMPANIES.some((c) => toCompanyKey(c.name) === entry.companyKey);
    if (isCurated && totalQuestions === 0 && activePostings === 0) continue;

    const card: InterviewCompanyCard = {
      companyKey: entry.companyKey,
      companyName: entry.companyName,
      domain: domains.get(entry.companyKey) ?? null,
      activePostings,
      aiQuestionCount: entry.aiQuestionCount,
      contributedQuestionCount: entry.contributedQuestionCount,
      totalQuestions,
      mostRecentActivity: entry.mostRecentActivity,
    };

    const list = bySection.get(entry.section) ?? [];
    list.push(card);
    bySection.set(entry.section, list);
  }

  for (const list of bySection.values()) {
    list.sort((a, b) => b.activePostings - a.activePostings || b.totalQuestions - a.totalQuestions);
  }

  const sections = SECTION_ORDER.map((name) => ({ name, companies: bySection.get(name) ?? [] })).filter(
    (s) => s.companies.length > 0,
  );

  const companies = sections.reduce((n, s) => n + s.companies.length, 0);
  const totalQuestions =
    banksResult.reduce((n, row) => n + questionCount(row.questions), 0) + contributedResult.length;

  return { sections, stats: { companies, totalQuestions, last30Days } };
}
