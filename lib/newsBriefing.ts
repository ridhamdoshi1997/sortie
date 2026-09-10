import { createAdminDbClient } from "@/lib/admin/client";
import type { NewsItem } from "@/lib/newsIngestion";

// "Your briefing" — the personalised news tab (2026-09-10, direct user
// request: it should show news related to the user's own profile, not the
// generic category feed).
//
// Scored in plain code, deliberately, with NO AI call. Matching a headline to
// a candidate's stated roles/skills/industries is literal term overlap, which
// a scorer does exactly and cheaply; sending every story through a model on
// every page view would put a real per-view cost on a tab someone opens
// daily, which is the same reasoning app/jobs/recommended follows.
//
// Honesty rule this file exists to enforce: a story appears here ONLY because
// something in the profile actually matched it, and every card can say which
// signal matched. When nothing matches, the caller shows an empty state — it
// never falls back to the generic feed relabelled as "yours", which would be
// the news equivalent of the "Recommended" false promise this codebase
// already had to undo once (see Navbar.tsx's jobsSubItems comment).

export type BriefingItem = NewsItem & {
  /** Why this story is in the user's briefing — shown on the card. */
  matchedOn: string[];
  score: number;
};

export type BriefingProfile = {
  jobTitlesSeeking: string[] | null;
  currentTitle: string | null;
  skills: string[] | null;
  industries: string[] | null;
  savedCompanies: string[];
};

// Weights, highest signal first. A company the candidate is actively tracking
// is a far stronger signal than a skill keyword appearing in a summary, and
// the ordering should reflect that rather than treating all matches equally.
const WEIGHT_COMPANY = 10;
const WEIGHT_TITLE = 4;
const WEIGHT_INDUSTRY = 3;
const WEIGHT_SKILL = 2;

// Words too generic to be evidence of anything. Without this, a profile
// listing "Management" or "Technology" matches most of the feed and the
// briefing stops being personal at all.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "senior", "junior", "lead", "staff", "principal",
  "manager", "management", "engineer", "developer", "analyst", "associate",
  "specialist", "coordinator", "director", "officer", "technology", "tech",
  "business", "services", "service", "solutions", "systems", "general",
]);

function meaningfulTerms(values: (string | null | undefined)[]): string[] {
  return [
    ...new Set(
      values
        .filter((v): v is string => Boolean(v?.trim()))
        .flatMap((v) => v.toLowerCase().split(/[^a-z0-9+#.]+/))
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    ),
  ];
}

function containsTerm(haystack: string, term: string): boolean {
  // Word-boundary match, so "ai" does not match "said" and "go" does not
  // match "going" — a substring test here produced exactly that kind of
  // false positive when this was first sketched.
  return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(haystack);
}

export async function getBriefing(profile: BriefingProfile, limit = 24): Promise<BriefingItem[]> {
  const titleTerms = meaningfulTerms([...(profile.jobTitlesSeeking ?? []), profile.currentTitle]);
  const skillTerms = meaningfulTerms(profile.skills ?? []);
  const industryTerms = meaningfulTerms(profile.industries ?? []);
  const companies = (profile.savedCompanies ?? []).filter(Boolean);

  if (titleTerms.length === 0 && skillTerms.length === 0 && industryTerms.length === 0 && companies.length === 0) {
    return [];
  }

  // One read across every category — the briefing is explicitly not scoped to
  // a single tab's subject. Bounded so a growing table never turns this into
  // a full-table scan on a page render.
  const client = createAdminDbClient();
  const { data } = await client.database
    .from("news_items")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(200)
    .returns<NewsItem[]>();

  const companySet = new Set(companies.map((c) => c.toLowerCase()));
  const scored: BriefingItem[] = [];

  for (const item of data ?? []) {
    // Title carries the most signal; the AI summary and career-impact lines
    // are included so a story about a candidate's industry still matches when
    // the headline names only a company.
    const haystack = `${item.title} ${item.ai_summary ?? ""} ${item.ai_career_impact ?? ""}`.toLowerCase();
    const matchedOn: string[] = [];
    let score = 0;

    if (item.company_name && companySet.has(item.company_name.toLowerCase())) {
      score += WEIGHT_COMPANY;
      matchedOn.push(item.company_name);
    }

    for (const [terms, weight] of [
      [titleTerms, WEIGHT_TITLE],
      [industryTerms, WEIGHT_INDUSTRY],
      [skillTerms, WEIGHT_SKILL],
    ] as [string[], number][]) {
      for (const term of terms) {
        if (containsTerm(haystack, term)) {
          score += weight;
          if (matchedOn.length < 4 && !matchedOn.some((m) => m.toLowerCase() === term)) matchedOn.push(term);
        }
      }
    }

    if (score > 0) scored.push({ ...item, matchedOn, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, limit);
}
