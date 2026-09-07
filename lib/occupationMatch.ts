// Occupation-based job title relevance.
//
// Contains information from O*NET 31.0 by the U.S. Department of Labor,
// Employment and Training Administration (USDOL/ETA), used under the CC BY 4.0
// licence. O*NET® is a trademark of USDOL/ETA. The data is unmodified in
// meaning; titles are normalised for lookup only.
// https://www.onetcenter.org/database.html
//
// WHY THIS EXISTS
//
// Word overlap cannot tell related occupations from unrelated ones, and this
// codebase tried both ends of that. Matching ANY word returned Health and
// Safety Advisors for a "Financial Advisor" search. Requiring EVERY word then
// rejected "Financial Planner", which is the same profession. Measured on one
// real search: 333 jobs collected, 286 rejected, and the rejected list was
// mostly Financial Planners, Investment Advisors and Wealth Advisors -- close
// to what a competitor shows for the same query.
//
// O*NET maps everyday titles onto occupations, so "is this the same kind of
// job" becomes a set intersection instead of a guess about words:
//   Financial Advisor / Financial Planner / Investment Advisor -> 13-2052
//   Health and Safety Advisor -> 19-5011, Financial Analyst -> 13-2051
//
// It is NOT a replacement for the word matcher, it is a first pass. Real
// postings carry titles no taxonomy lists, so anything the taxonomy does not
// recognise falls through to matchesSearchTitle rather than being dropped.

import { matchesSearchTitle } from "@/lib/jobScraper";

type Db = {
  database: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => any;
  };
};

// Leading words that describe level, not occupation. Stripped so "Senior
// Financial Advisor" resolves the same as "Financial Advisor".
const SENIORITY_PREFIX =
  /^(senior|sr\.?|junior|jr\.?|lead|principal|staff|chief|head of|associate|assistant|entry.level|experienced|developing)\s+/;

// Must match the normalisation the import applied, or nothing joins.
export function normalizeTitle(raw: string | null | undefined): string {
  let t = (raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, " ")      // "(Evergreen)", "(Toronto/Waterloo)"
    .split(/[,\-–|/]/)[0]          // "Financial Planner - Wealth Management"
    .replace(/[^a-z0-9&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 3; i++) {
    const next = t.replace(SENIORITY_PREFIX, "");
    if (next === t) break;
    t = next;
  }
  return t.trim();
}

// Candidate lookup keys for one title, most specific first. The progressive
// prefix drop is what lets "Developing Investment Advisor Toronto" reach
// "investment advisor" -- the head noun carries the occupation, the leading
// words qualify it.
//
// Capped at three drops on purpose: dropping further eventually reaches a bare
// noun that means something else ("Wealth Planning Consultant" -> "planning
// consultant" hits Urban Planners), and a wrong occupation is worse than an
// unmatched one, which merely falls through to word matching.
function lookupKeys(title: string): string[] {
  const normalized = normalizeTitle(title);
  if (!normalized) return [];
  const words = normalized.split(" ");
  const keys = [normalized];
  for (let i = 1; i < Math.min(words.length, 4); i++) keys.push(words.slice(i).join(" "));

  // Plural variants, because O*NET names occupations in the plural
  // ("Pharmacists", "Marketing Managers") while people search in the singular.
  // Found live: "marketing manager" and "pharmacist" resolved to NOTHING and
  // silently fell back to word matching, while "dentist" and "lawyer" worked
  // only because O*NET happens to also list them as singular lay titles.
  //
  // Both directions, since lay titles are singular and canonical names plural.
  // Cheap: these are extra keys on a lookup that is already batched, and a
  // variant that does not exist simply misses.
  for (const key of [...keys]) {
    if (key.endsWith("s")) keys.push(key.slice(0, -1));
    else keys.push(`${key}s`);
  }
  return [...new Set(keys)];
}

// Chunked because a single .in() carries every value in the URL, and PostgREST
// rejects a long one. Found live: 3,151 index rows produce ~12,000 candidate
// keys, the request failed, and this function fell back to word matching --
// silently doing the exact thing the taxonomy exists to replace, while logging
// a warning with an empty message. The same URL-length limit already bit this
// codebase in lib/reresolveApplyLink.ts and lib/inngest/functions.ts, both of
// which batch for this reason.
const TITLE_LOOKUP_BATCH_SIZE = 400;

// A title belonging to more than this many occupations is treated as unresolved
// rather than matched, on both the expansion and the matching side. Otherwise a
// posting titled "Account Manager" -- which O*NET files under five occupations
// including this one -- would be accepted as the same profession as a financial
// advisor. Unresolved falls through to word matching, which is the honest answer
// for a title that genuinely does not name a profession.
const MAX_TITLE_AMBIGUITY = 2;

// Ceiling on how many equivalent titles one search expands into. Sized from the
// real distribution: financial advisor 47, software engineer 74, marketing
// manager 29, registered nurse 191 -- all real professions sit under this, while
// the outliers it trims (warehouse associate 895, teacher 732) are the ones
// whose expansions had stopped being specific.
const MAX_EXPANSION_TITLES = 250;

async function fetchOccupations(db: Db, titles: string[]): Promise<Map<string, Set<string>>> {
  const byTitle = new Map<string, Set<string>>();
  if (titles.length === 0) return byTitle;

  for (let i = 0; i < titles.length; i += TITLE_LOOKUP_BATCH_SIZE) {
    const batch = titles.slice(i, i + TITLE_LOOKUP_BATCH_SIZE);
    const { data, error } = await db.database
      .from("occupation_titles")
      .select("title,soc_group")
      // Deliberately NOT filtered by occupation_count here. The cutoff belongs
      // on the EXPANSION -- which titles we go and fetch -- not on reading back
      // what a title means. Applying it here too cost 101 real results
      // (176 -> 75) by refusing to resolve any posting whose title happens to
      // span three occupations, which then fell through to strict word matching
      // and was dropped.
      .in("title", batch);

    if (error) {
      // Partial data is still better than none: every batch that succeeded
      // contributes, and any title left unresolved falls through to word
      // matching per job rather than dropping the whole pass.
      console.warn(
        `[occupationMatch] taxonomy batch ${i / TITLE_LOOKUP_BATCH_SIZE} of ` +
        `${Math.ceil(titles.length / TITLE_LOOKUP_BATCH_SIZE)} failed (${batch.length} titles): ` +
        `${error.message || "no message"}`,
      );
      continue;
    }
    for (const row of (data ?? []) as { title: string; soc_group: string }[]) {
      if (!byTitle.has(row.title)) byTitle.set(row.title, new Set());
      byTitle.get(row.title)!.add(row.soc_group);
    }
  }
  return byTitle;
}

function occupationsFor(keys: string[], table: Map<string, Set<string>>): Set<string> | null {
  for (const key of keys) {
    const hit = table.get(key);
    if (hit && hit.size > 0) return hit;
  }
  return null;
}

/**
 * Keeps jobs whose title is the same OCCUPATION as the searched title.
 *
 * Falls back to matchesSearchTitle whenever the taxonomy cannot answer -- for
 * the search title itself, or for an individual job -- so an unrecognised title
 * is never silently dropped. That fallback is why this can be enabled without
 * risking a regression on unusual searches.
 */
export async function filterByOccupation<T extends { title?: string }>(
  db: Db,
  jobs: T[],
  searchTitle: string,
): Promise<{ kept: T[]; matchedByOccupation: number; taxonomyCovered: boolean }> {
  if (!searchTitle.trim() || jobs.length === 0) {
    return { kept: jobs, matchedByOccupation: 0, taxonomyCovered: false };
  }

  const searchKeys = lookupKeys(searchTitle);
  const jobKeys = jobs.flatMap((job) => lookupKeys(job.title ?? ""));
  const table = await fetchOccupations(db, [...new Set([...searchKeys, ...jobKeys])]);

  const searchOccupations = occupationsFor(searchKeys, table);
  if (!searchOccupations) {
    // The searched title is not in the taxonomy at all: no occupation to
    // compare against, so this pass has nothing to add.
    return {
      kept: jobs.filter((job) => matchesSearchTitle(searchTitle, job.title)),
      matchedByOccupation: 0,
      taxonomyCovered: false,
    };
  }

  let matchedByOccupation = 0;
  const kept = jobs.filter((job) => {
    const occupations = occupationsFor(lookupKeys(job.title ?? ""), table);
    if (!occupations) return matchesSearchTitle(searchTitle, job.title);
    for (const soc of occupations) {
      if (searchOccupations.has(soc)) {
        matchedByOccupation += 1;
        return true;
      }
    }
    // The taxonomy knows this title and says it is a DIFFERENT occupation.
    // That is a real verdict, so it outranks word overlap -- this is what stops
    // "Health and Safety Advisor" coming back for a Financial Advisor search.
    return false;
  });

  return { kept, matchedByOccupation, taxonomyCovered: true };
}

/**
 * Expands a searched title into every equivalent title in the same occupation.
 *
 * This is what makes the INDEX reachable by occupation. filterByOccupation can
 * only narrow a set SQL already returned, so while the index was queried by
 * title WORDS, Financial Planner and Investment Advisor rows were never fetched
 * for it to consider -- measured, 22 rows reached the filter while 129 postings
 * in the same index were the same occupation.
 *
 * Returns null when the title is not in the taxonomy, so the caller keeps its
 * existing word-based query rather than searching for nothing.
 */
export async function expandTitleToOccupationTitles(
  db: Db,
  searchTitle: string,
): Promise<string[] | null> {
  const keys = lookupKeys(searchTitle);
  if (keys.length === 0) return null;

  const { data: socRows, error: socError } = await db.database
    .from("occupation_titles")
    .select("title,soc_group,occupation_name")
    .in("title", keys);
  if (socError || !socRows) return null;

  // Most specific key that resolved, so "senior financial advisor" prefers
  // "financial advisor" over a shorter, vaguer fallback.
  const byKey = new Map<string, Set<string>>();
  for (const row of socRows as { title: string; soc_group: string }[]) {
    if (!byKey.has(row.title)) byKey.set(row.title, new Set());
    byKey.get(row.title)!.add(row.soc_group);
  }
  const allGroups = occupationsFor(keys, byKey);
  if (!allGroups || allGroups.size === 0) return null;

  // When a title belongs to several occupations, keep only the one it actually
  // NAMES (2026-09-07). "financial advisor" belongs to both "Personal Financial
  // Advisors" and "Securities, Commodities, and Financial Services Sales
  // Agents"; expanding into both is what pulled Sales Representatives and
  // Account Managers into a financial-advisor search, because the sales
  // occupation legitimately contains those titles.
  //
  // Scored by how many of the searched words appear in the occupation's own
  // canonical name: "Personal Financial Advisors" matches both "financial" and
  // "advisor", the sales one matches only "financial". Ties keep every tied
  // occupation, so a genuinely dual-occupation title is not arbitrarily halved.
  const nameByGroup = new Map<string, string>();
  for (const row of socRows as { soc_group: string; occupation_name?: string | null }[]) {
    if (row.occupation_name) nameByGroup.set(row.soc_group, row.occupation_name.toLowerCase());
  }
  const searchWords = normalizeTitle(searchTitle).split(" ").filter((w) => w.length > 2);
  const score = (group: string): number => {
    const name = nameByGroup.get(group);
    if (!name) return 0;
    return searchWords.filter((w) => name.includes(w.slice(0, 5))).length;
  };
  const best = Math.max(...[...allGroups].map(score));
  const groups = new Set([...allGroups].filter((g) => score(g) === best));

  // Generic titles are excluded from the expansion. O*NET files "account
  // manager", "sales associate" and "sales representative" under the same
  // occupations as "financial advisor", so expanding to every title in those
  // occupations pulled Sales Managers and Account Managers into a
  // financial-advisor search -- reported live.
  //
  // How many OCCUPATIONS a title spans is what separates them: 7 for "sales
  // associate", 5 for "account manager", 1 for "financial planner",
  // "investment advisor" and "wealth advisor". A title spanning many
  // occupations names a level or a function, not a profession, so it cannot
  // answer "is this the same kind of job". Cutting at 2 keeps every real
  // synonym and drops the filler: 146 titles becomes 122.
  const { data: titleRows, error: titleError } = await db.database
    .from("occupation_titles")
    .select("title")
    .in("soc_group", [...groups])
    .lte("occupation_count", MAX_TITLE_AMBIGUITY)
    // Most specific titles first, then capped. Some occupations are genuinely
    // enormous -- "warehouse associate" resolves to one holding 895 lay titles --
    // and past a point an expansion stops describing a profession and starts
    // matching everything adjacent to it. Ordering by ambiguity means the cap
    // drops the vaguest titles rather than an arbitrary alphabetical slice.
    .order("occupation_count", { ascending: true })
    .limit(MAX_EXPANSION_TITLES);
  if (titleError || !titleRows) return null;

  const titles = new Set((titleRows as { title: string }[]).map((r) => r.title));

  // The searched title itself ALWAYS belongs in its own expansion.
  //
  // It is not implied: the expansion returns O*NET's LAY titles for the
  // occupation, and a title that exists there only as the plural canonical name
  // is absent from it. Measured live -- 183 index postings normalise to exactly
  // "pharmacist", the expansion held 20 titles, and "pharmacist" was not one of
  // them, so a Pharmacist search returned 4 results while 183 sat in the index.
  // The same trap applies to any occupation named in the plural.
  for (const key of lookupKeys(searchTitle)) titles.add(key);

  return titles.size > 0 ? [...titles] : null;
}
