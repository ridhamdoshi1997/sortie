# Sortie — Save to Tracker (browser extension)

Manifest V3 Chrome extension. Shows an inline "Save to Sortie" widget (with a
live match-score badge) next to the Apply button on job postings across 10
platforms (LinkedIn, Indeed, SimplyHired, Dice, CareerBuilder, RemoteOK,
Monster, We Work Remotely, Built In, ZipRecruiter), posts the job straight
into your Sortie tracker via a personal API key (Settings → Browser
extension in the app), and can autofill a job-application form on **any**
site from your Sortie profile — with dedicated adapters for Greenhouse and
Lever.

## Load it locally (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `extension/` folder — the folder
   whose direct contents include `manifest.json` (not a subfolder like
   `icons`). The dialog only lists subfolders, so if `manifest.json` isn't
   visible that's expected — just confirm the "Folder:" field itself says
   `extension`, not `extension/icons` or similar.
4. Click the Sortie icon in the toolbar (pin it via the puzzle-piece menu if
   it's hidden), generate a key from Settings → Browser extension in the
   app, and paste it into the popup.
5. Open a real LinkedIn or Indeed job posting — a "Save to Sortie" widget
   appears next to the Apply button (or floating bottom-right, if the page's
   Apply button couldn't be found — see the v1.2 section below).

## Real bug fixed 2026-08-18 (v1.3): LinkedIn detection was silently failing entirely on a real logged-in session

Debugged live with the user against their real logged-in LinkedIn account
(the thing v1.2's own caveat said hadn't been confirmed yet). Root cause,
confirmed via `document.querySelector` run directly in their DevTools
console: LinkedIn's current build renders the job title/company as
CSS-module-hashed classes (`_44c32d2f _4208c38f`, etc.) on plain
`<span>`/`<a>` elements — there is no `<h1>` on the page at all, and none of
the old BEM-style classes (`.job-details-jobs-unified-top-card__*`) exist
anymore. Since `extractLinkedIn()` required title+company+description to all
resolve before returning anything, the whole extraction silently returned
null — no widget, no badge, no job-context panel in the popup, no error
shown anywhere.

**Fixed by no longer depending on CSS classes for LinkedIn at all**:
- Title + company now come from `document.title`, which LinkedIn reliably
  formats as `"Job Title | Company | LinkedIn"` regardless of the CSS build
  (confirmed live against the real page).
- Description now comes from a runtime heuristic (`findLargestTextBlock` in
  `content.js`) — the most specific large text block on the page — instead
  of a fixed selector.

This is a fundamentally more durable approach than the v1.2 selectors were:
hashed CSS-module classes can change on any LinkedIn deploy, so hardcoding
one (even a freshly-confirmed one) would likely break again soon. Indeed's
extraction is untouched — its `data-testid` attributes were separately
confirmed stable and don't share this problem.

## v1.2 (2026-08-18): inline widget, match score, popup redesign, adapters

Researched via `agy` against real competitor extensions (Simplify Copilot,
Teal, Careerflow) before building — see the session notes for the full
writeup. Four real changes:

1. **Inline Shadow-DOM widget, replacing the floating bottom-right button.**
   A bottom-right float competes with LinkedIn's own chat widgets for the
   same screen corner and gets covered up. The widget now tries to insert
   itself right next to the site's own Apply button (selectors in
   `content.js`'s `INLINE_ANCHOR_SELECTORS` — best-effort, not independently
   confirmed against a live logged-in session) and falls back to the old
   floating position automatically if no anchor is found. Everything inside
   the widget lives in a Shadow DOM, so LinkedIn/Indeed's own site-wide CSS
   can't mangle its styling.
2. **Live match-score badge.** As soon as a job posting is detected, the
   widget requests a score from `/api/extension/score-preview` and shows a
   color-coded `NN% match` badge. This is cache-first on the backend: if the
   user already has a tracked job with the same title+company and a real
   score, that's reused for free — a genuinely new AI call
   (`lib/extensionScorePreview.ts`, usage-gated at 40/day under the
   `extension_score_preview` action) only fires on a real cache miss.
3. **Context-aware popup.** Opening the popup on a detected job page now
   shows the parsed title/company/score before you save, plus a "Save as"
   picker (Draft or Applied) — Applied logs a real `application_events` row
   the same way the main app's own status-change flow does.
4. **Autofill v2 — adapter pattern.** Generic keyword/autocomplete matching
   alone breaks down on major ATS platforms. `background.js`'s
   `sortieAutofillPage` now detects Greenhouse (`greenhouse.io`) and Lever
   (`lever.co`) by hostname and fills their known, stable field names
   directly (Greenhouse: `#first_name`/`#last_name`/`#email`/`#phone`; Lever:
   `name="name"` as one combined field, `urls[LinkedIn]`/`urls[GitHub]`)
   before the generic fallback runs on whatever's left. Also added: fuzzy
   matching for location-labeled `<select>` dropdowns (so "Toronto, ON"
   matches an option reading "Toronto, Ontario, Canada"), and a "Get résumé
   from Sortie ↗" link inserted next to any `<input type="file">` — browsers
   block scripts from populating a file input for real security reasons, so
   this doesn't try to fight that; it just gets the user their file one click
   away instead. **The Greenhouse/Lever selectors are based on those
   platforms' well-documented public field-naming conventions, not
   independently confirmed against a real live application in this pass** —
   same caveat as the LinkedIn logged-in selectors below. If an adapter's
   fields don't fill on a real posting, that's the first thing to check.

## Real bug fixed 2026-08-18: saves were silently failing entirely

`manifest.json`'s `host_permissions` only listed LinkedIn/Indeed — it never
included the Sortie API's own domain. A Manifest V3 service worker's
cross-origin `fetch()` is subject to normal CORS enforcement unless the
target origin is declared in `host_permissions` (declaring it is what lets
Chrome treat the extension's own requests as privileged, bypassing the need
for the server to send `Access-Control-Allow-Origin` at all). Without that
entry, every `background.js` fetch to `/api/extension/*` failed before it
even reached the network tab in a way a user would notice — the button just
flipped to "Failed — retry" with no further detail. Fixed by adding both
`https://jobpilot-experiment.vercel.app/*` and `http://localhost:3001/*` (for
local testing) to `host_permissions`. **If you loaded this extension before
2026-08-18, remove and re-load it — a stale copy will keep failing.**

## Autofill (added 2026-08-18)

The popup's **"Fill my info on this page"** button reads your Sortie profile
(name, email, phone, LinkedIn, portfolio/GitHub, location) via
`/api/extension/profile` and fills matching fields on **whatever page is
currently active** — not limited to LinkedIn/Indeed, since it's injected
directly into the active tab via `chrome.scripting.executeScript` +
`activeTab` rather than a declared content script scoped to specific
domains. Field matching uses the `autocomplete` attribute first (the
standardized, most reliable signal), falling back to `name`/`id`/`placeholder`/
associated `<label>` text keyword matching.

**Explicit scope boundary, matching this app's "capture-first, never
auto-apply" stance (`build-plan.md` §G): this only fills fields. It never
clicks Submit, Apply, or Continue, and never simulates a multi-step wizard
on its own.** The user always reviews what got filled and submits the
application themselves. It also never overwrites a field that already has a
value — so re-running it after you've started editing a form won't clobber
your edits.

Known limitation: outside of the Greenhouse/Lever adapters (see v1.2 above),
field detection is generic/heuristic — it won't know about a portal's own
custom multi-select/searchable-autocomplete widgets, only plain
`<input>`/`<textarea>`/`<select>` elements. Workday and iCIMS have no adapter
yet (both use heavier custom JS widgets that the generic pass can't reach) —
a realistic next step, not started.

## Scope of the save-to-tracker flow

- **LinkedIn + Indeed only** for the save button and job-detail extraction.
  Google Jobs was deliberately left out — Google actively CAPTCHA-blocks
  automated traffic against its own jobs search UI, the same wall this app's
  own scraper (`agent/research.ts`) already hit and stayed away from working
  around, and the jobs panel itself is a complex, frequently-changing widget
  rather than a stable page to select against.
- LinkedIn title/company come from `document.title` and description from a
  runtime "largest text block" heuristic (v1.3, see above) — deliberately
  not CSS-class-based, since a real logged-in session showed LinkedIn's
  classes are CSS-module-hashed and churn across deploys. This was
  live-debugged against a real logged-in account, unlike the original v1
  selectors it replaced. Indeed's `data-testid` attributes were separately
  confirmed directly and are untouched.
- No recruiter-email parsing or auto-detection — the user clicks a button on
  a page they're already looking at, matching `build-plan.md` §Q5's scoped-down
  v1.
- **No Glassdoor support, or any platform beyond LinkedIn + Indeed, as of
  this line.** See the "Future platform expansion" research section below
  for the full per-platform feasibility breakdown (login walls, DOM
  stability, ATS behind Apply) — Glassdoor specifically has a hard login
  wall that blocks the DOM after 1-2 job views when logged out, a real
  buildability concern, not just an unexplored one.
- **v1.5 (2026-08-18)**: every captured job now carries which site it came
  from (`source: "linkedin"` | `"indeed"`, set by `extractLinkedIn()`/
  `extractIndeed()`, sent through to `/api/extension/capture-job`, stored on
  `jobs.source`). Previously every extension capture — regardless of site —
  silently collapsed into the same generic `"url"` source the manual
  paste-a-job flow uses, making extension-sourced jobs indistinguishable from
  each other or from a manual paste anywhere in the app. Now surfaced as a
  small "via LinkedIn"/"via Indeed"/"Pasted" badge on both `JobResultCard`
  (List view, `/find-jobs`) and `KanbanCard` (Board view, `/missions`) —
  scraped jobs (the majority, `source: "SerpApi"`) show no badge at all,
  since that's the default case, not a distinguishing fact.

## v1.5 (2026-08-18): 8 more platforms shipped — SimplyHired, Dice, CareerBuilder, RemoteOK, Monster, We Work Remotely, Built In, ZipRecruiter

Built the same session the research below was done, per direct user request ("add the best 3 you have plus everything else, skip Glassdoor and Wellfound for now"). Every selector below was checked against a real live job posting via the Browser pane before being written — same discipline as the LinkedIn v1.3 rewrite — with one exception (Monster, see below).

**Most of these publish real schema.org `JobPosting` structured data** (`<script type="application/ld+json">`) — the markup Google Jobs itself requires for search-result rich snippets, so most job boards that want that traffic already emit it. This is far more stable than any CSS selector, since it doesn't depend on the visual DOM at all. New shared helper `extractFromJsonLd()` in `content.js` powers SimplyHired, Dice, CareerBuilder, RemoteOK, and Monster — confirmed live on real postings for the first four. A new `stripHtml()` helper handles the fact that several sites (confirmed live: SimplyHired, Dice, CareerBuilder, RemoteOK) ship the JSON-LD `description` field as raw HTML, not plain text.

**Three sites don't have JobPosting JSON-LD (confirmed live) and got bespoke DOM selectors instead**, same shape as the existing LinkedIn/Indeed extractors:
- **We Work Remotely** — `document.title` parsing (reliably "Remote {title} at {company}", same trick as LinkedIn) for title+company, `.lis-container__job__content__description` for the description. The whole site is remote-only by definition, so location is hardcoded `"Remote"` rather than parsed.
- **Built In** — a real `<h1>` for title, the job header's `a[href*="/company/"]` link for company, `.html-parsed-content` for the description (the specific class Built In renders the employer's submitted HTML into — confirmed live to be distinct from several other large-but-irrelevant containers on the page, like a "What the Team is Saying" culture section).
- **ZipRecruiter** — no stable page-level `<h1>` (it stays the search-results heading even with a job selected in the two-pane view, confirmed live), and every CSS class churns (generic Tailwind-style utility classes, not job-specific) — but real `data-testid` attributes exist and are far more durable. `[data-testid="job-details-scroll-container"]` scopes every selector to the currently-open job's pane specifically (its first `h2` for title, an `a[href*="ziprecruiter.com/co/"]` link for company), not the adjacent results list.

**Monster's selectors were NOT independently verified.** Live verification hit Monster's own bot-detection challenge mid-research ("Verification Required... Use of developer or inspection tools may trigger this") before its real DOM could be inspected — likely triggered by the browser-automation tooling used for verification itself, not something a real user's content script would face, but that's not something this session could actually confirm either way. Built instead on CareerBuilder's confirmed-working `extractFromJsonLd()` path, since the two sites share the same underlying job listings (confirmed live: an identical job UUID appeared in both sites' search results for the same real posting) — a documented best-effort, same honesty tier as the LinkedIn logged-in-variant fallback selectors elsewhere in this file, not independently confirmed against Monster's own page.

**Badges**: all 8 get a neutral `bg-surface-secondary text-text-secondary` "via {Platform}" badge (`lib/jobSource.ts`) — a deliberate scope decision, not an oversight. LinkedIn/Indeed got real confirmed brand colors + real fetched logos because that was explicitly asked for; doing the same for 8 more sites (a real hex code + a working logo fetch, each confirmed live) is a meaningfully bigger task than adding capture support itself, and wasn't part of this pass.

**Manifest**: `host_permissions` and `content_scripts.matches` extended to all 8 new domains; version bumped to 1.5.0.

**Live-verified end to end, not just compiled**: created a real test job for each of the 8 platforms via a real `curl` call against the actual capture API (with a real generated key), confirmed all 8 stored the correct `source` value via direct `db query`, and confirmed all 8 badges render with the correct label on `/missions` (both the Board view and the new "Source" filter dropdown, which picks up whatever sources actually exist in the loaded jobs). Test jobs and the test API key deleted after.

## Research behind the above (2026-08-18, via `agy`)

Researched per this project's established tool-priority, in response to a direct user question ("what about other job boards like Glassdoor"). For each candidate platform: is normal logged-in browsing gated behind a login wall (would block a content script from reading the DOM at all), is the DOM stable (semantic HTML/`data-testid` vs. hashed CSS classes that churn every deploy), and what's behind the Apply button (a known ATS an autofill adapter could target, or fully in-platform). **Key framing from the research, worth remembering**: since this extension runs as a content script inside a real, already-logged-in user's own browser session, it inherently sidesteps the server-side Cloudflare/Akamai/CAPTCHA walls that block headless scrapers — the real blockers for THIS architecture are account/login walls and DOM volatility, not bot-detection. **Real-world verification (above) didn't always match the research's cached knowledge** — e.g. Dice's actual current frontend is a Next.js/React build with clean JobPosting JSON-LD, not the Angular custom-element (`<dhi-job-details>`) UI the research described — a reminder that a research pass is a starting point for where to look, not a substitute for checking the real live page before writing a selector.

| Platform | Login wall? | Anti-bot (normal browsing) | DOM stability | Apply flow |
| --- | --- | --- | --- | --- |
| Glassdoor | **Yes — hard.** Blocks the DOM after 1-2 job views if logged out | Strict against servers, fine for a real logged-in user | Poor — hashed CSS classes (`.css-123xyz`), needs `data-test` attributes | Mixed: in-platform Easy Apply + external ATS (often Workday/Greenhouse) |
| ZipRecruiter | No hard wall to view; login prompted on apply | Fine | Moderate — generated classes, but description containers are fairly predictable | Famous for in-platform 1-Click Apply; enterprise jobs often redirect external |
| Monster | No | Akamai/Cloudflare present but fine for real browsing | Poor — rebuilt on Next.js/React, obfuscated classes, frequent A/B-test layout churn | Mixed in-platform/external |
| Dice | No | Fine | **Good** — Angular custom elements (e.g. `<dhi-job-details>`), stable targets vs. CSS classes | Mostly "Dice Easy Apply" in-platform, some external |
| Wellfound (AngelList Talent) | **Yes — functionally gated**, full details need login | Strict against automated tools, fine for a logged-in real user | Poor visually (GraphQL+React, obfuscated classes) — but the research flagged `__NEXT_DATA__`/Apollo state JSON embedded in the page as likely far more stable to extract from than the visual DOM, worth trying first if this one gets built | Exclusively in-platform |
| SimplyHired | No | Cloudflare present, fine for real browsing | **Good** — owned by Indeed, shares its infrastructure, relatively semantic | Indeed's "Simply Apply" plus standard external ATS redirects |
| CareerBuilder | No | Fine | Moderate — standard structure, occasional churn | Mixed in-platform/external |
| Built In | No | Fine | **Good** — predictable layout blocks, mostly semantic | Mostly external, heavily Greenhouse/Lever (tech-focused audience) |
| We Work Remotely | No | Minimal | **Excellent** — classic server-rendered HTML, stable class names | Exclusively external (Greenhouse/Workable/Lever/etc.) |
| RemoteOK | No | Aggressive against server scrapers, fine for real browsing | Good — vanilla HTML/PHP, predictable classes | Exclusively external, to employer sites/ATS |
| Google Jobs | N/A | **Already ruled out** — real CAPTCHA wall hit and confirmed (see the v1 scope note above) | — | — |

**All 8 non-excluded candidates from this table are now shipped** (v1.5, above) — the "Top 3" the research originally flagged (We Work Remotely, Built In, SimplyHired) plus the rest of the "everything else" set, per direct user request. Real-world verification of each (see v1.5 above) didn't always match this table exactly — e.g. Dice's "Poor... needs `data-testid` attributes" concern (from the research, below) turned out not to apply: its real current build has clean JobPosting JSON-LD, not the volatility this table predicted.

**Still excluded, deliberately**: Glassdoor and Wellfound both have hard login walls that would gate the extension on the user already being logged into that specific site (not just Sortie) — buildable, but a real UX dependency this extension doesn't currently have for LinkedIn/Indeed. Revisit only on explicit request.

**Official brand colors, confirmed via the same research pass** (for potential future badge coloring, per `ui-tokens.md`'s "Source Badges" section and Invariant on never using a generic color for a branded source — the 8 shipped platforms above deliberately did NOT get this treatment yet, see v1.5's badges note): Glassdoor `#00B764`, ZipRecruiter `#128C1E` (green) / `#203A5F` (navy) — ZipRecruiter has no published public style guide, these were extracted from their current logo assets, not an official brand page, so treat as best-effort if ever implemented.

## What gets captured, and how the rest gets filled in

The extension itself only ever extracts 5 fields directly from the page:
`title`, `company`, `location` (best-effort), `description` (a raw text
blob), and `url`. It does **not** scrape salary, job type, seniority,
benefits, requirements, or hiring process — unlike the main SerpApi scraper,
which gets most of those as real structured fields from Google Jobs' own
data.

That gap is closed by the same AI evaluation pipeline every job already goes
through for scoring, not a separate mechanism: `createExternalJob`
(`lib/externalJob.ts`) fires the same `jobs/evaluate` Inngest event the main
scraper flow fires, and `lib/evaluator.ts`'s prompt already extracts
`requirements`/`niceToHave`/`benefits`/`aboutRole`/`hiringProcess`/
`seniorityLevel`/`yearsExperienceRequired`/a fallback `salary` string
directly from whatever `description` text it's given — see
`lib/inngest/functions.ts`'s write-back of `evalResult.*` onto the job row.
So an extension-captured job ends up with the same full structured detail
set as a scraped one, genuinely, as long as the captured `description` text
is complete — which depends entirely on `content.js`'s extraction quality
(LinkedIn's "largest text block" heuristic and Indeed's `#jobDescriptionText`
selector, see above).

**One real, currently-unclosed gap**: `job_type` (e.g. "Full-time") is only
ever read as evaluator *input* (`lib/evaluator.ts` line ~119), never produced
as evaluator *output* — it's populated from SerpApi's own structured field on
scraped jobs, but nothing backfills it from free text, so it stays `null`
forever on every extension-captured job. Low-stakes (it's a minor card-meta
field, not scored on), not fixed as of this note.

## Before shipping to the Chrome Web Store

- Real icon art (current icons are a placeholder diamond mark, not final
  brand art).
- The v1.3 `document.title`/largest-text-block extraction was confirmed to
  return the right title+company live, but the description heuristic's
  exact output wasn't diffed character-for-character against the real
  posting text yet — worth a spot check.
- A real logged-in LinkedIn pass to confirm the inline-anchor selectors
  actually land next to the real Apply button rather than falling back to
  floating (this specific piece is still unconfirmed even after the v1.3
  fix, since that fix only touched title/company/description extraction).
- A real pass against at least one live Greenhouse and Lever posting to
  confirm the v1.2 adapters' selectors still match — they were written
  against those platforms' documented conventions, not click-tested.
- A real pass on a form with a searchable location dropdown to confirm the
  fuzzy `<select>` matching behaves as intended.
- Workday/iCIMS adapters — not started.
- Store listing assets (screenshots, promo copy) and the review submission
  itself — not started.
