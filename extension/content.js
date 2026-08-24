// Sortie "Save to Tracker" — content script.
//
// LinkedIn extraction rewritten 2026-08-18 (v1.3) after live-debugging a
// real logged-in session together with the user: LinkedIn's actual current
// build renders the job title/company/etc. as CSS-module-hashed class names
// (e.g. "_44c32d2f _4208c38f") on plain <span>/<a> elements, not the stable
// BEM-style classes (.job-details-jobs-unified-top-card__*) this file
// previously targeted — there is no `<h1>` on the page at all in this build.
// Hashed classes are unstable by design (they can change on any LinkedIn
// deploy), so this no longer tries to match them. Instead: title+company
// come from `document.title`, which LinkedIn reliably formats as
// "Job Title | Company | LinkedIn" regardless of the CSS build (confirmed
// live); description comes from a runtime heuristic — the most specific
// (smallest-subtree) large text block on the page — rather than a fixed
// selector. Indeed's data-testid attributes were separately confirmed
// stable and are untouched. The inline-anchor selectors (below) still carry
// the original "best-effort, not independently confirmed" caveat — if the
// widget keeps landing in its floating fallback position instead of inline,
// check those next.
//
// Google Jobs was deliberately dropped from v1: Google actively CAPTCHA-blocks
// automated traffic against its own jobs search UI (the same wall this app's
// own scraper already hit and stayed away from working around — see
// agent/research.ts's looksLikeSearchBlockPage) and the jobs panel itself is
// a complex, frequently-changing dynamic widget, not a stable page. Revisit
// only if a real, legitimate way to read it turns up.
//
// v1.5 (2026-08-18) — 8 more platforms added (SimplyHired, Dice,
// CareerBuilder, RemoteOK, ZipRecruiter, We Work Remotely, Built In,
// Monster), per real research into feasibility (context/build-plan.md §Q5,
// extension/README.md's "Future platform expansion" section) plus live
// verification of each site's actual DOM before writing any selector —
// same discipline as the LinkedIn v1.3 rewrite above. Glassdoor and
// Wellfound were explicitly excluded: both hard-gate full job details
// behind a login wall on THEIR site (not just Sortie), a real dependency
// this extension doesn't ask for anywhere else. Most of the new sites embed
// real schema.org JobPosting structured data (`<script type="application/
// ld+json">`) — Google's own rich-snippet requirement for search visibility,
// so most job boards that want SEO traffic already publish it — which is
// far more stable than any CSS selector since it doesn't care what the
// visual DOM looks like. `extractFromJsonLd()` below is a shared helper for
// every site that has it; only the sites that don't (We Work Remotely,
// Built In, ZipRecruiter — confirmed live, not assumed) get bespoke DOM
// selectors. **Monster's selectors were NOT independently verified** — live
// verification hit Monster's own bot-detection challenge mid-research
// ("Verification Required... Use of developer or inspection tools"),
// blocking a real look at its DOM. Built instead on CareerBuilder's
// confirmed-working JobPosting JSON-LD pattern, since the two share the
// same underlying job listings (confirmed live: an identical job UUID
// appeared in both sites' search results for the same posting) — a
// documented best-effort, same honesty tier as the LinkedIn logged-in
// fallback selectors, not independently confirmed against Monster itself.

// Strips HTML tags from a job-description string. Several sites' JobPosting
// JSON-LD ships `description` as raw HTML (SimplyHired/Dice/CareerBuilder/
// RemoteOK/Monster all confirmed live to do this), not plain text — a
// detached element's textContent is the standard, safe way to convert
// HTML to plain text in a browser content-script context (never
// document.write or innerHTML-then-read-back on a LIVE node, which would
// execute the page's own embedded scripts).
function stripHtml(html) {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent.trim();
}

// Reads schema.org JobPosting data from a page's own `application/ld+json`
// script tags — Google Jobs rich-snippet SEO markup, present on most job
// boards regardless of their visual DOM's stability. Handles both a bare
// JobPosting object and one wrapped in an array (`@graph`-style pages).
// Some sites' JSON-LD is technically malformed (We Work Remotely's contains
// raw unescaped control characters inside string values, confirmed live) —
// JSON.parse throws on those, so each script tag is tried independently and
// a parse failure just moves on to the next one rather than aborting.
function extractFromJsonLd(source) {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let parsed;
    try {
      parsed = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const jobPosting = candidates.find((c) => c && c["@type"] === "JobPosting");
    if (!jobPosting || !jobPosting.title || !jobPosting.description) continue;

    const company = jobPosting.hiringOrganization?.name ?? null;
    if (!company) continue;

    const locationObj = jobPosting.jobLocation?.address ?? jobPosting.jobLocation;
    const location =
      typeof locationObj === "string"
        ? locationObj
        : [locationObj?.addressLocality, locationObj?.addressRegion].filter(Boolean).join(", ") || null;

    return {
      title: jobPosting.title,
      company,
      location,
      description: stripHtml(jobPosting.description),
      url: window.location.href,
      source,
    };
  }
  return null;
}

function text(selector) {
  const el = document.querySelector(selector);
  return el ? el.textContent.trim() : null;
}

function firstText(selectors) {
  for (const selector of selectors) {
    const value = text(selector);
    if (value) return value;
  }
  return null;
}

function firstElement(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

// Finds the job description without relying on any class name — LinkedIn's
// hashed CSS-module classes churn across builds, so a fixed selector is a
// guaranteed future break. Candidates are the largest text blocks on the
// page (a real job description is reliably one of the biggest); among the
// top few, the most specific one (smallest DOM subtree) is preferred, since
// the single largest match is often an outer wrapper that also contains
// sidebar/nav content rather than the description element itself.
function findLargestTextBlock(minLength) {
  const EXCLUDE_TAGS = new Set(["SCRIPT", "STYLE", "NAV", "HEADER", "FOOTER", "ASIDE"]);
  const candidates = [...document.querySelectorAll("div, section, article")]
    .filter((el) => !EXCLUDE_TAGS.has(el.tagName) && !el.closest("nav, header, footer, aside"))
    .map((el) => ({ el, len: (el.innerText || "").length }))
    .filter((c) => c.len >= minLength)
    .sort((a, b) => b.len - a.len)
    .slice(0, 10);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.el.querySelectorAll("*").length - b.el.querySelectorAll("*").length);
  return candidates[0].el.innerText.trim();
}

function extractTitleAndCompanyFromDocumentTitle() {
  const parts = document.title
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const title = parts[0];
  const company = parts[1] && parts[1].toLowerCase() !== "linkedin" ? parts[1] : null;
  if (!title || !company) return null;
  return { title, company };
}

function extractLinkedIn() {
  const fromTitle = extractTitleAndCompanyFromDocumentTitle();
  if (!fromTitle) return null;

  const description = findLargestTextBlock(500);
  if (!description) return null;

  // Best-effort, optional — location isn't required for a job to be
  // capturable, unlike title/company/description above.
  const location = firstText([
    ".job-details-jobs-unified-top-card__primary-description-container",
    ".topcard__flavor--bullet",
  ]);

  return { title: fromTitle.title, company: fromTitle.company, location, description, url: window.location.href, source: "linkedin" };
}

function extractIndeed() {
  const title = firstText(["h1.jobsearch-JobInfoHeader-title", "h1"]);
  const company = text('[data-testid="inlineHeader-companyName"]');
  const location = text('[data-testid="inlineHeader-companyLocation"]');
  const description = text("#jobDescriptionText");

  if (!title || !company || !description) return null;
  return { title, company, location, description, url: window.location.href, source: "indeed" };
}

// JobPosting JSON-LD confirmed live on real job postings (2026-08-18) —
// same shape as extractFromJsonLd's contract.
function extractSimplyHired() {
  return extractFromJsonLd("simplyhired");
}
function extractDice() {
  return extractFromJsonLd("dice");
}
function extractCareerBuilder() {
  return extractFromJsonLd("careerbuilder");
}
function extractRemoteOK() {
  return extractFromJsonLd("remoteok");
}
// Not independently verified — see the v1.5 header comment above.
// CareerBuilder's confirmed-working extractor reused as a documented
// best-effort, since the two sites share the same underlying job listings.
function extractMonster() {
  return extractFromJsonLd("monster");
}

// No JobPosting JSON-LD (confirmed live) — the whole site is remote-only by
// definition, so location is always "Remote" rather than parsed from the
// page. Title+company come from document.title's reliable "X at Company"
// format (same trick as LinkedIn, confirmed live: "Remote {title} at
// {company}"), not the sidebar company-name element, which isn't its own
// isolated leaf node in the real DOM (confirmed live — it's a bare text
// node alongside a "View company" link, not worth a fragile selector over
// the already-reliable document.title parse).
function extractWeWorkRemotely() {
  const raw = document.title.replace(/^Remote\s+/i, "");
  const atIndex = raw.lastIndexOf(" at ");
  if (atIndex === -1) return null;
  const title = raw.slice(0, atIndex).trim();
  const company = raw.slice(atIndex + 4).trim();
  if (!title || !company) return null;

  const description = text(".lis-container__job__content__description");
  if (!description) return null;

  return { title, company, location: "Remote", description, url: window.location.href, source: "weworkremotely" };
}

// No JobPosting JSON-LD (confirmed live). Real, semantic h1 for title;
// company confirmed live via the first `/company/<slug>` link (Built In's
// own company-profile link, present in the job header). Description
// confirmed live via `.html-parsed-content` — the specific class Built In
// gives the container it renders the employer's submitted HTML into
// (distinct from several other large-but-irrelevant containers on the page,
// e.g. "What the Team is Saying"/culture sections).
function extractBuiltIn() {
  const title = text("h1");
  if (!title) return null;

  const companyLink = document.querySelector('a[href*="/company/"]');
  const company = companyLink ? companyLink.textContent.trim() : null;
  if (!company) return null;

  const description = text(".html-parsed-content");
  if (!description) return null;

  return { title, company, location: null, description, url: window.location.href, source: "builtin" };
}

// No JobPosting JSON-LD on the search/detail split-pane view (confirmed
// live — the page's own <h1> stays the search-results heading, not the
// selected job). ZipRecruiter's generated CSS classes churn (confirmed
// live: page-wide Tailwind-style utility classes, nothing job-specific),
// but real `data-testid` attributes are present and far more durable —
// `job-details-scroll-container` scopes every selector below to the
// currently-open job's right-hand pane specifically, not the left-hand
// results list.
function extractZipRecruiter() {
  const pane = document.querySelector('[data-testid="job-details-scroll-container"]');
  if (!pane) return null;

  const title = pane.querySelector("h2")?.textContent.trim() ?? null;
  if (!title) return null;

  const companyLink = pane.querySelector('a[href*="ziprecruiter.com/co/"]');
  const company = companyLink ? companyLink.textContent.trim() : null;
  if (!company) return null;

  const description = pane.innerText.trim();
  if (!description) return null;

  return { title, company, location: null, description, url: window.location.href, source: "ziprecruiter" };
}

function extractJob() {
  const host = window.location.hostname;
  if (host.includes("linkedin.com")) return extractLinkedIn();
  if (host.includes("indeed.com")) return extractIndeed();
  if (host.includes("simplyhired.com")) return extractSimplyHired();
  if (host.includes("dice.com")) return extractDice();
  if (host.includes("careerbuilder.com")) return extractCareerBuilder();
  if (host.includes("remoteok.com")) return extractRemoteOK();
  if (host.includes("monster.com")) return extractMonster();
  if (host.includes("weworkremotely.com")) return extractWeWorkRemotely();
  if (host.includes("builtin.com")) return extractBuiltIn();
  if (host.includes("ziprecruiter.com")) return extractZipRecruiter();
  return null;
}

// Where the widget tries to anchor itself INLINE, next to the site's own
// Apply button, instead of floating loose over the page (2026-08-18 v1.2 —
// a floating bottom-right button competes for the same screen real estate
// LinkedIn's own chat/messaging widgets use and gets covered up). Each
// selector targets the Apply button/container itself; the widget is
// inserted as its next sibling. Falls back to the old floating position if
// none match — a real possibility given these weren't independently
// confirmed against a live logged-in session (see header comment).
const INLINE_ANCHOR_SELECTORS = {
  "linkedin.com": [
    ".jobs-apply-button--top-card",
    ".jobs-s-apply",
    ".top-card-layout__cta-container",
  ],
  "indeed.com": ["#applyButtonLinkContainer", ".jobsearch-IndeedApplyButton-newDesign", ".jobsearch-ApplyButtonContent"],
};

function findInlineAnchor() {
  const hostKey = Object.keys(INLINE_ANCHOR_SELECTORS).find((k) => window.location.hostname.includes(k));
  if (!hostKey) return null;
  return firstElement(INLINE_ANCHOR_SELECTORS[hostKey]);
}

const WIDGET_HOST_ID = "sortie-widget-host";

const WIDGET_STYLES = `
  :host { all: initial; }
  .sortie-widget {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    margin: 8px 0;
  }
  .sortie-widget.sortie-floating {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: #17181a;
    border: 1px solid #35322c;
    border-radius: 12px;
    padding: 8px 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  }
  .sortie-save-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    background: #c9711f;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .sortie-save-btn:hover { opacity: 0.92; }
  .sortie-save-btn[data-state="saved"] { background: #2e8b57; }
  .sortie-save-btn[data-state="error"] { background: #b3261e; }
  .sortie-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  .sortie-badge[data-tier="high"] { background: rgba(46,139,87,0.16); color: #2e8b57; }
  .sortie-badge[data-tier="mid"] { background: rgba(201,113,31,0.16); color: #c9711f; }
  .sortie-badge[data-tier="low"] { background: rgba(179,38,30,0.16); color: #f2867a; }
  .sortie-refresh-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: #a8a29b;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
  }
  .sortie-refresh-btn:hover { background: rgba(255,255,255,0.08); color: #f2f0ed; }
  .sortie-refresh-btn[data-loading="true"] { animation: sortie-spin 0.8s linear infinite; }
  @keyframes sortie-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

function scoreTier(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

function ensureWidget() {
  let hostEl = document.getElementById(WIDGET_HOST_ID);
  if (hostEl) return hostEl.shadowRoot;

  hostEl = document.createElement("div");
  hostEl.id = WIDGET_HOST_ID;
  const shadow = hostEl.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = WIDGET_STYLES;
  shadow.appendChild(style);

  const container = document.createElement("div");
  container.className = "sortie-widget";
  container.innerHTML = `
    <span class="sortie-badge" id="sortie-score-badge" hidden></span>
    <button class="sortie-refresh-btn" id="sortie-refresh-btn" type="button" title="Re-check match score" hidden>&#8635;</button>
    <button class="sortie-save-btn" id="sortie-save-btn" type="button">Save to Sortie</button>
  `;
  shadow.appendChild(container);

  const anchor = findInlineAnchor();
  if (anchor && anchor.parentElement) {
    anchor.parentElement.insertBefore(hostEl, anchor.nextSibling);
  } else {
    container.classList.add("sortie-floating");
    document.body.appendChild(hostEl);
  }

  shadow.getElementById("sortie-save-btn").addEventListener("click", handleSaveClick);
  shadow.getElementById("sortie-refresh-btn").addEventListener("click", () => fetchScorePreview(shadow, true));
  return shadow;
}

function setButtonState(shadow, state) {
  const button = shadow.getElementById("sortie-save-btn");
  button.dataset.state = state;
  if (state === "idle") button.textContent = "Save to Sortie";
  if (state === "saving") button.textContent = "Saving…";
  if (state === "saved") button.textContent = "Saved ✓";
  if (state === "error") button.textContent = "Failed — retry";
  if (state === "no-key") button.textContent = "Connect Sortie first";
}

function renderScoreBadge(shadow, matchScore) {
  const badge = shadow.getElementById("sortie-score-badge");
  if (matchScore == null) {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;
  badge.dataset.tier = scoreTier(matchScore);
  badge.textContent = `${matchScore}% match`;
}

// Shared by the automatic once-per-job fetch (tick, below) and the manual
// refresh button — re-extracts the job fresh each call (rather than reusing
// a cached job object) so a manual click also picks up any page content
// that changed since the automatic fetch last ran. The backend itself stays
// cache-first regardless of which path calls it (see
// app/api/extension/score-preview/route.ts) — this button re-asks, it
// doesn't bypass that cache.
async function fetchScorePreview(shadow, isManualRefresh) {
  const job = extractJob();
  if (!job) return;

  const jobKey = `${job.title}::${job.company}`;
  const refreshButton = shadow.getElementById("sortie-refresh-btn");
  if (isManualRefresh) refreshButton.dataset.loading = "true";

  const result = await chrome.runtime.sendMessage({ type: "SORTIE_GET_SCORE_PREVIEW", job });
  if (isManualRefresh) delete refreshButton.dataset.loading;

  // Only apply the result if the user is still looking at the same job —
  // a slow response for a job they've since navigated away from shouldn't
  // overwrite whatever's showing now.
  if (result?.success && jobKey === lastJobKey) {
    lastScorePreview = result.preview;
    renderScoreBadge(shadow, result.preview.matchScore);
  }
}

async function handleSaveClick() {
  const shadow = ensureWidget();
  const job = extractJob();
  if (!job) {
    setButtonState(shadow, "error");
    return;
  }

  setButtonState(shadow, "saving");
  // The actual network call happens in the background service worker, not
  // here — see background.js's header comment for why.
  const result = await chrome.runtime.sendMessage({ type: "SORTIE_SAVE_JOB", job });
  if (result?.noKey) {
    setButtonState(shadow, "no-key");
    return;
  }
  setButtonState(shadow, result?.success ? "saved" : "error");
}

let lastJobKey = null;
let lastScorePreview = null; // { matchScore, missingSkills } for the currently-shown job, or null until it resolves

function tick() {
  const job = extractJob();
  if (!job) return;

  const jobKey = `${job.title}::${job.company}`;
  const shadow = ensureWidget();
  shadow.getElementById("sortie-refresh-btn").hidden = false;

  if (jobKey !== lastJobKey) {
    lastJobKey = jobKey;
    lastScorePreview = null;
    setButtonState(shadow, "idle");
    renderScoreBadge(shadow, null);

    // Fire once per newly-seen job, not on every 1.5s tick — the backend
    // itself is also cache-first (an already-tracked job with this exact
    // title+company reuses its real match_score for free), but this local
    // guard avoids even the network round-trip on every poll. The refresh
    // button (fetchScorePreview, above) covers the case where this
    // automatic fetch never resolved, or the user wants a manual re-check.
    fetchScorePreview(shadow, false);
  }
}

// Lets the popup show the currently-detected job + its score (once resolved)
// without a duplicate extraction/scoring round-trip of its own.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SORTIE_GET_CURRENT_JOB") return;
  sendResponse({ job: extractJob(), preview: lastScorePreview });
});

// Both sites are SPAs — navigating between job cards updates the page
// without a real reload, so a one-shot run on load isn't enough. A light
// poll is simpler and more reliable here than fighting each site's own
// internal routing events, which aren't part of any stable public contract.
tick();
setInterval(tick, 1500);

// Lets the popup trigger the same save flow as the on-page button, e.g. when
// the button has scrolled out of view.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SORTIE_SAVE_NOW") return;
  handleSaveClick().then(() => {
    const shadow = ensureWidget();
    const button = shadow.getElementById("sortie-save-btn");
    sendResponse({ state: button?.dataset.state ?? "error" });
  });
  return true; // keep the message channel open for the async response
});
