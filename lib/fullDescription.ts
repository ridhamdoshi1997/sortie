import { fetchViaJinaReader } from "@/agent/research";

// On-demand full job description (2026-09-03).
//
// Why this exists: the proactive crawl caches ~100,000+ postings so that a
// live search can draw on them for free, but it deliberately stores only a
// 500-character description preview (see CACHED_DESCRIPTION_MAX_CHARS in
// lib/proactiveAtsCrawl.ts). That cap is not a nicety — measured against
// real crawls, storing full text for Workable alone projects to ~51,000
// postings and ~182 MB, with Dayforce adding ~56 MB, against a 500 MB
// database that also has to hold real user data.
//
// The product still offers a full-description preview, so the text has to
// come from somewhere. It comes from here: fetched from the employer's own
// source at the moment a candidate actually OPENS a job, and written back to
// that one jobs row. Only postings someone genuinely looked at ever cost
// storage, which is a tiny fraction of the cache. Same fire-and-forget
// after() + "attempt once" shape the apply-link rescue already uses on the
// job detail page.
//
// Ordering is deliberate: a platform's own JSON API first (clean, exact
// text), then the posting page as HTML, then Jina Reader for pages that
// block plain server-side fetches — the same escalation
// agent/research.ts already established for bot-protected pages.

const GREENHOUSE_JOB_URL = /job-boards\.greenhouse\.io\/([a-z0-9_-]+)\/jobs\/(\d+)/i;
const WORKABLE_JOB_URL = /apply\.workable\.com\/j\/([A-Z0-9]+)/i;

// A cached preview is stored truncated with a trailing ellipsis, so its
// presence is a reliable "there is more text at the source" marker. A very
// short description means the platform's list mode returned none at all
// (Greenhouse/Ashby/Workday/BambooHR all do), which is equally worth
// filling in.
const MIN_USEFUL_DESCRIPTION_CHARS = 600;

export function needsFullDescription(description: string | null | undefined): boolean {
  const text = (description ?? "").trim();
  if (!text) return true;
  return text.endsWith("…") || text.length < MIN_USEFUL_DESCRIPTION_CHARS;
}

// Converts posting HTML to text while PRESERVING structure, which an
// earlier version destroyed (2026-09-04, direct user report that fetched
// descriptions rendered as one undifferentiated wall of text). The old
// version ended with `.replace(/\s+/g, " ")`, collapsing every newline —
// and lib/jobDescriptionFormatter.ts, which turns a posting into headings,
// paragraphs and bullet lists for JobDescription.tsx, detects those blocks
// from exactly the line breaks and bullet characters that were being erased.
// So the formatter received a single line, found no structure, and fell back
// to rendering the raw string.
//
// Block-level tags therefore become newlines and list items keep a real
// bullet character, so the existing formatter can do its job. Only
// horizontal whitespace is collapsed; runs of blank lines are capped at one.
const BLOCK_LEVEL_TAGS = /<\/?(p|div|section|article|header|footer|tr|table|h[1-6]|ul|ol|blockquote)[^>]*>/gi;

function htmlToText(html: string): string {
  return html
    // Angle brackets are decoded FIRST, before any tag handling. Sources
    // differ on whether their markup arrives raw or escaped — LinkedIn's
    // JSON-LD description carries "&lt;br&gt;&lt;li&gt;" rather than real
    // tags — and decoding at the end (as this did originally) meant escaped
    // markup was never recognised as markup at all: every block boundary was
    // missed and the whole posting collapsed into one paragraph. The
    // Greenhouse branch already did this decode inline for the same reason;
    // doing it here fixes every source at once.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // HTML COMMENTS FIRST, before any tag stripping (2026-09-09).
    //
    // Workday and other Knockout.js boards use containerless bindings, which
    // are comments carrying live JavaScript:
    //   <!-- ko if: Locations().length > 1 && showAllLocations() == false,
    //        text: $.t('Opportunity.Opportunities.MoreJobLocations') -->
    //
    // The generic tag strip below cannot handle those: it stops at the first
    // ">" INSIDE the expression, so the tail of the script survives as body
    // text. A real posting rendered as pages of
    // "1 && showAllLocations() == false, text: $.t(..." with a stray "0 -->",
    // and every downstream extraction then had nothing real to read -- which
    // is why that job had an empty responsibilities list and no decoder.
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    // Template markup leaves <li> elements with no content, which the list
    // rule below would turn into a column of bare bullets.
    .replace(/<li[^>]*>\s*<\/li>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    // A real bullet, not just a newline: the formatter's own list detection
    // keys off bullet characters as well as bare line breaks.
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(BLOCK_LEVEL_TAGS, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;|&lsquo;|&#39;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-")
    // Horizontal whitespace only — newlines are load-bearing here.
    .replace(/[ 	]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // Bullets with nothing after them, left by emptied template elements.
    .replace(/^[ 	]*•[ 	]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fromGreenhouse(applyUrl: string): Promise<string | null> {
  const match = applyUrl.match(GREENHOUSE_JOB_URL);
  if (!match) return null;
  const [, slug, id] = match;
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`);
    if (!res.ok) return null;
    const data: { content?: string } = await res.json();
    // Greenhouse returns HTML-escaped markup in `content`.
    return data.content ? htmlToText(data.content) : null;
  } catch {
    return null;
  }
}

async function fromWorkable(applyUrl: string, companySlug: string | null): Promise<string | null> {
  const match = applyUrl.match(WORKABLE_JOB_URL);
  if (!match || !companySlug) return null;
  try {
    const res = await fetch(`https://apply.workable.com/api/v2/accounts/${companySlug}/jobs/${match[1]}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const data: { description?: string } = await res.json();
    return data.description ? htmlToText(data.description) : null;
  } catch {
    return null;
  }
}

// Ashby's posting page is client-rendered too, but its public board API
// returns descriptionPlain per job — already clean text, no HTML stripping
// guesswork. Worth a dedicated branch rather than leaving it to the page
// fallback: Ashby is the single largest platform in the crawl cache (38,617
// postings), and the HTML fallback returned only ~640 borderline characters
// of chrome for the same posting.
const ASHBY_JOB_URL = /jobs\.ashbyhq\.com\/([a-z0-9_%-]+)\/([0-9a-f-]{36})/i;

async function fromAshby(applyUrl: string): Promise<string | null> {
  const match = applyUrl.match(ASHBY_JOB_URL);
  if (!match) return null;
  const [, slug, id] = match;
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${decodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data: { jobs?: { id?: string; descriptionPlain?: string; descriptionHtml?: string }[] } = await res.json();
    const job = (data.jobs ?? []).find((candidate) => candidate.id?.toLowerCase() === id.toLowerCase());
    if (!job) return null;
    return job.descriptionPlain?.trim() || (job.descriptionHtml ? htmlToText(job.descriptionHtml) : null);
  } catch {
    return null;
  }
}

// Workday renders its posting page entirely client-side, so fetching the
// apply URL as HTML yields nothing usable. Its CXS API does have a per-job
// detail endpoint though, reachable by rewriting the human URL
//   https://{tenant}.{wd}.myworkdayjobs.com/{locale}/{board}/job/...
// into
//   https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{board}/job/...
// Confirmed live 2026-09-03 against a real stored posting: HTTP 200 with
// 5,395 characters of jobDescription.
const WORKDAY_JOB_URL = /https:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)(\/job\/.*)$/i;

async function fromWorkday(applyUrl: string): Promise<string | null> {
  const match = applyUrl.match(WORKDAY_JOB_URL);
  if (!match) return null;
  const [, tenant, wdInstance, board, path] = match;
  try {
    const res = await fetch(`https://${tenant}.${wdInstance}.myworkdayjobs.com/wday/cxs/${tenant}/${board}${path}`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const data: { jobPostingInfo?: { jobDescription?: string } } = await res.json();
    const description = data.jobPostingInfo?.jobDescription;
    return description ? htmlToText(description) : null;
  } catch {
    return null;
  }
}

// LinkedIn postings arrive from the kaix Apify actor with NO description at
// all — that field only populates with its `fetchDetails` option, which costs
// ~17s per job and blows Apify's 300s API ceiling, so it is deliberately off
// (see lib/jobScraper.ts's apifyLinkedInProvider). That would leave every
// LinkedIn job opening to an empty detail page.
//
// It turns out not to matter: LinkedIn's public job pages are fetchable
// server-side (confirmed live 2026-09-04 — HTTP 200 with a plain
// "Mozilla/5.0" agent) AND they embed a schema.org JobPosting block. Parsing
// that gives a CLEAN description — 5,452 characters for a real Edward Jones
// posting, with none of the surrounding page chrome a raw HTML strip would
// include — plus employmentType, skills and experienceRequirements.
//
// So the expensive per-job detail fetch is unnecessary: the same information
// arrives free, in about a second, and only for jobs a candidate actually
// opens. Same schema.org approach this project's browser extension already
// uses for LinkedIn/Indeed/Dice/Monster (see extension/content.js's
// extractFromJsonLd), so it's an established pattern here, not a new one.
const LINKEDIN_JOB_URL = /linkedin\.com\/jobs\/view\//i;
const JSON_LD_BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;

async function fromLinkedInJsonLd(applyUrl: string): Promise<string | null> {
  if (!LINKEDIN_JOB_URL.test(applyUrl)) return null;
  try {
    const res = await fetch(applyUrl, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
    if (!res.ok) return null;
    const html = await res.text();

    // A page can carry several ld+json blocks (breadcrumbs, org markup);
    // take the first that is genuinely a JobPosting with a description.
    for (const [, raw] of html.matchAll(JSON_LD_BLOCK)) {
      try {
        const parsed: { "@type"?: string; description?: string } = JSON.parse(raw);
        if (parsed["@type"] !== "JobPosting" || !parsed.description) continue;
        const text = htmlToText(parsed.description);
        if (text.length >= MIN_USEFUL_DESCRIPTION_CHARS) return text;
      } catch {
        // One malformed block must not abandon the others.
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Two user-agents, short one FIRST, and the order is not cosmetic. iCIMS
// answers HTTP 405 to a full Chrome UA string and HTTP 200 to a bare
// "Mozilla/5.0" — verified by isolating the two variables against one real
// posting (clean URL + short UA: 200 with 13,155 chars; identical URL +
// Chrome UA: 405). Presumably a WAF rule keyed on the longer string. Other
// hosts do the opposite and want something browser-shaped, so both are
// tried. Every ATS adapter in lib/atsProviders.ts already uses the short
// form successfully, which is why it leads here.
const PAGE_FETCH_USER_AGENTS = [
  "Mozilla/5.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

async function fromPageHtml(applyUrl: string): Promise<string | null> {
  for (const userAgent of PAGE_FETCH_USER_AGENTS) {
    try {
      const res = await fetch(applyUrl, { headers: { "User-Agent": userAgent }, redirect: "follow" });
      if (!res.ok) continue;
      const text = htmlToText(await res.text());
      if (text.length >= MIN_USEFUL_DESCRIPTION_CHARS) return text;
    } catch {
      // Try the next user-agent rather than giving up on the host.
    }
  }
  return null;
}

// Whole-page text is noisier than an API's own description field (it carries
// nav and footer chrome), so it's capped to keep a single stored row sane.
const MAX_STORED_DESCRIPTION_CHARS = 20000;

// Refuses a "description" that is actually page source.
//
// The sanitiser now strips Knockout containerless bindings, but that is a fix
// for one framework's markup and the next board will have its own. This is the
// backstop: if what came out still carries code, storing it is worse than
// storing nothing, because every downstream step then extracts from noise --
// which is how one posting ended up with an empty responsibilities list and a
// decoder that had nothing to decode.
//
// Deliberately narrow. These markers do not occur in real prose: a job posting
// does not contain "data-bind", "keyCode" or an arrow-function body. A posting
// that legitimately mentions JavaScript still reads as "JavaScript", not as
// "function(){showAllLocations(true)}".
const CODE_MARKERS = /(data-bind|ko if:|\$\.t\(|keyCode|function\s*\(\s*\)\s*\{|showAllLocations|<!--|-->)/;

function looksLikePageSource(text: string): boolean {
  if (CODE_MARKERS.test(text)) return true;
  // A wall of empty bullets is the other signature: template <li> elements
  // that carried only bindings, leaving the marker and nothing else.
  const bullets = text.match(/^\s*•\s*$/gm)?.length ?? 0;
  return bullets >= 3;
}

export async function fetchFullDescription(
  applyUrl: string | null | undefined,
  source: string | null | undefined,
  companySlug: string | null = null,
): Promise<string | null> {
  if (!applyUrl) return null;

  const platform = (source ?? "").toLowerCase();
  // LinkedIn first when the link is one: its JSON-LD is cleaner than
  // anything the generic HTML path would produce for that page.
  const viaLinkedIn = await fromLinkedInJsonLd(applyUrl);
  if (viaLinkedIn) return viaLinkedIn.length > MAX_STORED_DESCRIPTION_CHARS ? viaLinkedIn.slice(0, MAX_STORED_DESCRIPTION_CHARS) : viaLinkedIn;

  const viaApi =
    platform === "greenhouse"
      ? await fromGreenhouse(applyUrl)
      : platform === "workable"
        ? await fromWorkable(applyUrl, companySlug)
        : platform === "workday"
          ? await fromWorkday(applyUrl)
          : platform === "ashby"
            ? await fromAshby(applyUrl)
            : null;

  // `in_iframe=1` is iCIMS's own embedded-widget flag. It isn't fatal (that
  // 405 turned out to be a user-agent rule, see PAGE_FETCH_USER_AGENTS), but
  // the widget variant serves a stripped-down page — 6,233 chars against
  // 13,155 for the same posting without it — so strip it for the fuller
  // text. Rows crawled before the adapter stopped emitting it still carry it.
  const fetchUrl = applyUrl.replace(/[?&]in_iframe=1/i, "").replace(/\?$/, "");

  const text = viaApi ?? (await fromPageHtml(fetchUrl)) ?? (await fetchViaJinaReader(fetchUrl).then((t) => (t ? htmlToText(t) : null)).catch(() => null));

  if (!text || text.length < MIN_USEFUL_DESCRIPTION_CHARS) return null;

  // Never store page source. Returning null leaves the row's own description
  // in place and lets a later attempt try again, which is strictly better than
  // persisting markup that every downstream extraction will then read as if it
  // were the posting.
  //
  // This bites hardest on Indeed, and for a structural reason: an Indeed apply
  // link redirects to the EMPLOYER's own ATS, so the page fetched here is
  // whatever framework that employer runs -- Workday's Knockout templates, in
  // the case that surfaced this.
  if (looksLikePageSource(text)) {
    console.warn(`[fullDescription] discarded page source for ${applyUrl}`);
    return null;
  }
  return text.length > MAX_STORED_DESCRIPTION_CHARS ? text.slice(0, MAX_STORED_DESCRIPTION_CHARS) : text;
}
