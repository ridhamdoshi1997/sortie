# Sortie — Save to Tracker (browser extension)

Manifest V3 Chrome extension. Shows an inline "Save to Sortie" widget (with a
live match-score badge) next to the Apply button on LinkedIn/Indeed postings,
posts the job straight into your Sortie tracker via a personal API key
(Settings → Browser extension in the app), and can autofill a job-application
form on **any** site from your Sortie profile — with dedicated adapters for
Greenhouse and Lever.

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
