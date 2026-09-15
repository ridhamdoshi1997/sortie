# UI Registry

Living document. Updated after every component is built. Read this before building any new component — match existing patterns exactly before inventing new ones.

---

## How to Use

Before building any component:

1. Check if a similar component already exists here
2. If yes — match its exact classes
3. If no — build it following ui-rules.md and ui-tokens.md, then add it here

After building any component — update this file with the component name, file path, and exact classes used.

---

## Components

### Admin System Health — /admin/system (Phase 51, 2026-09-10)

Files: `components/admin/SystemHealthPanel.tsx`, `app/admin/system/page.tsx`, `lib/systemHealth.ts`, `actions/adminSystem.ts`. Nav: `AdminSidebar.tsx` (second item, `Activity` icon).
- Card shell reuses the admin convention exactly: `rounded-2xl border border-border bg-surface p-5 shadow-card`, section label `text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary`.
- Status colours map to existing semantic tokens only — `text-success` / `text-warning` / `text-error` / `text-text-muted`. **`unknown` is a first-class state with its own icon and label**; it is never rendered as OK. A bug caught during verification did exactly that (an unreachable cache showed `ok` with null counts), which is the failure this whole page exists to prevent.
- Metrics use `font-mono text-xl font-bold tabular-nums`, consistent with every other real number in this app.
- Destructive-ish action (Pause crawls) uses a warning-toned outline button, not `.btn-signal`; the recovery action (Resume) uses `.btn-signal`. The env kill switch is rendered as read-only text with an explanation, never as a control — see the file's own comment for why.

### News cards — /news (Phase 51, 2026-09-10)

Files: `components/news/NewsCard.tsx`, `app/news/page.tsx`, `lib/newsIngestion.ts`, `lib/newsBriefing.ts`.
- Three sizes: `lead` (hero image + full AI block), `standard` (image band + clamped summary), `compact` (row with a small right-hand thumbnail).
- **The AI takeaway uses the shared `AiReadsCard`**, hero variant on `lead` and compact variant on `standard`. Do NOT hand-roll `border-l-2 border-agent bg-agent-light` here — that flat callout is explicitly superseded (see `AiReadsCard`'s own header comment on the ~24 files that each re-implemented it). Using it made the news cards read far louder than every other AI block in the app; corrected after the user flagged it against a screenshot.
- **Images are always the article's own.** No stock or placeholder fallback: a story without a real image renders typographically. Google's thumbnail cache (`gstatic.com`) is only ever rendered small — stretched to a 742px hero it measured 120×66 natural and looked like a smear — so `hasLargeImage()` decides which story gets the lead slot.
- Plain `<img>` with `referrerPolicy="no-referrer"`, not `next/image`: the publisher/thumbnail hosts would each need a `next.config` remote pattern, and the thumbnail hosts 403 a request that leaks a referrer.
- Briefing cards additionally render `matchedOn` chips (`bg-accent-muted text-accent`) so a personalised feed can always answer "why am I seeing this?".

### Weather widget — /news + /dashboard (Phase 51, 2026-09-10)

Files: `components/shared/WeatherWidget.tsx`, `lib/weather.ts`.
- Server Component; Open-Meteo (free, no key, no attribution requirement). Follows the reader's **live** location via Vercel edge geo headers, falling back to the profile location only when those are absent.
- Renders **nothing** when there is no real location — an empty slot is honest, a guessed city is not.
- Icon is chosen by a `renderIcon()` helper rather than a capitalised local component, which `react-hooks/static-components` flags as creating a component during render.


### Interview hub redesign + Contribute a question (Phase 50, cont'd, 2026-09-10)

Files: `components/interview/InterviewHub.tsx`, `components/interview/ContributeQuestionModal.tsx`, `components/interview/CompanyContributeButton.tsx`, `app/interview-questions/page.tsx`, `app/interview-questions/company/[key]/page.tsx`, `lib/interviewHub.ts`, `actions/interviewContributions.ts`.
Route: `/interview-questions` (hub grid), `/interview-questions/company/[key]` (new — per-company aggregate view, sits above the existing per-role-family `/interview-questions/[slug]` SEO pages which are unchanged).
Design brief was a competitor's company-tier browse page (stat bar, search, grouped cards, contribute modal) — adapted, not copied: every number shown is real (see `lib/interviewHub.ts`'s header comment), and a second real content source (human-submitted questions) was added alongside the existing AI-generated banks.
- Stat tiles: `rounded-xl border border-border bg-surface px-4 py-3 text-center`, value `font-mono text-2xl font-bold tabular-nums text-text-primary`, label `text-xs text-text-secondary`.
- Search input: plain `<input>` with a `Search` icon absolutely positioned at `left-3.5`, `h-11 rounded-lg border border-border bg-surface pl-10`. Client-side filter only — dataset is small, no server round-trip needed.
- Company card: `rounded-xl border border-border bg-surface p-4`, `CompanyLogo` (size `sm`) + name + "Updated Xd ago"; a neutral real-signal badge (`rounded-full bg-surface-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted`) for the active-postings count — **not** agent-teal, since that's a factual crawl stat, not AI-generated content.
- Question-count link uses `text-accent` (a user action — clicking navigates); the empty state ("No questions yet — be the first to add one") is a plain `text-text-muted` button opening the Contribute modal pre-filled with that company.
- Contribute modal reuses `components/profile/SectionModal.tsx` (no new modal shell built) with the same `inputClass` pattern `AddAccomplishmentModal.tsx` already established — kept consistent rather than inventing a second form-input style.
- **Color invariant enforced deliberately**: AI-generated question entries carry a small `bg-agent-light text-agent-dark` "AI" pill (agent-teal, per `ui-tokens.md`'s "exclusively AI-generated content" rule); contributed (human) questions carry no color-coded badge at all, just a neutral `bg-surface-secondary` role pill — never agent-teal, since that would misrepresent human content as AI-generated.
- Logo resolution: never pass a raw `https://logo.clearbit.com/...` URL as `logoUrl` — that endpoint is confirmed DNS-dead (see `components/shared/CompanyLogo.tsx`'s own comment). Pass a real resolved domain as `applyUrl={\`https://\${domain}\`}` instead and let `CompanyLogo`'s own unavatar.io chain resolve it.
- Cost posture: the hub's own data reads are free (cache DB + main DB reads only); nothing here triggers a paid Apify/SerpApi call or the paid AI evaluator.

### "Recommended" jobs tab (Phase 50, cont'd, 2026-09-10)

Files: `app/jobs/recommended/page.tsx`, `components/jobs/RecommendedJobCard.tsx`, `lib/jobRecommendations.ts`. Nav: `components/layout/Navbar.tsx`'s `jobsSubItems`, listed first (above Search).
Real replacement for the "Recommended" label removed 2026-08-25 for being a false promise (see `Navbar.tsx`'s own comment) — this time backed by a real profile-driven feed, deliberately with **no search box at all**, per direct user instruction.
- Page shell matches `/find-jobs`'s eyebrow+heading pattern (`bg-agent-light` pill, `font-display` h1) but swaps the `Sparkles` icon and drops the search form entirely.
- Card (`RecommendedJobCard`) is deliberately **read-only** — no Save/Hide/Status actions, since these are free-cache rows with no persisted `jobs.id` yet (see the component's own comment). Clicking opens the real employer apply link in a new tab.
- Matched-skill chips: `rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-text-secondary` — a literal keyword-overlap tag against the profile's `skills`, never an AI relevance claim.
- Two distinct empty states, per the "build the tried-but-empty state from day one" standing rule: no target roles at all → "Complete your profile" CTA to `/profile`; roles set but zero cache matches → "Go to Search" CTA to `/find-jobs` for a live pull.
- **Cost posture is the whole point of this component**: reads ONLY the free crawl cache (`queryProactiveCrawlCache`, the same cache-first path `/find-jobs` already warms) — never a paid source (Apify/SerpApi/TheirStack) and never the paid AI evaluator, because this is a passive tab a user might open on every visit. See `lib/jobRecommendations.ts`'s header comment before adding anything that could turn this into a per-view paid call.

### Company Watchlist manager (Portal Scanner, Phase 8)

Files: `components/find-jobs/TargetCompaniesManager.tsx`, `app/find-jobs/companies/page.tsx`
Route: `/find-jobs/companies`, linked from `/find-jobs` via a small `Building2` icon link next to the page eyebrow.
Last updated: 2026-08-27 (Phase 27). No existing CRUD-list precedent in this app to mirror — deliberately minimal v1, reuses existing primitives rather than inventing new ones.
- Card shell: `rounded-2xl border border-border bg-surface p-6 shadow-card` (matches other dashboard/settings cards).
- Add-row: `rounded-xl border border-border bg-surface-secondary p-4`, inputs `rounded-lg border border-border bg-surface px-3 py-2 text-sm`.
- Primary actions ("Add", "Scan now") use `.btn-signal` per this app's exhaustive-CTA convention.
- List rows: plain `divide-y divide-border` list, no card-per-row — this is metadata management, not a content feed, so the denser `JobResultCard` treatment doesn't apply.
- Delete uses the shared `<ConfirmDialog tone="danger">` (`components/ui/ConfirmDialog.tsx`) — same pattern as every other destructive action in this app, not a bespoke confirm.
- Empty state: dashed border + centered icon + one line, same shape as other empty states in this codebase (e.g. `OnboardingWizard`'s upload step).

### Job-detail mobile primitives — sticky Apply bar, scroll-aware tab overflow

Files: `components/job-details/JobIdentityRail.tsx` (`MobileApplyBar`), `components/ui/Tabs.tsx`, `components/agent/NavigatorLauncher.tsx`
Route: `/find-jobs/[id]` (mobile bar + FAB alignment); `Tabs.tsx`'s overflow fix applies everywhere the shared `Tabs` component is used
Last updated: 2026-08-26 (Phase 26). Direct user request ("make the job detail page mobile friendly"), 3 real bugs found live, not hypothetical.
- **`<MobileApplyBar job={job}>`** — `lg:hidden fixed inset-x-0 bottom-0` Apply bar, exported alongside `JobIdentityRail`. The rail's own inline Apply button is `hidden lg:inline-flex` (was plain `inline-flex`) so there's never a duplicate visible Apply button on either breakpoint. `pr-24` reserves the Navigator FAB's own footprint on the right. If you add another primary full-width CTA near the bottom of a mobile page, check it against the FAB's fixed `bottom-6 right-6, h-14 w-14` zone before shipping — this exact collision is easy to reintroduce.
- **FAB/bottom-bar alignment** — `NavigatorLauncher.tsx`'s FAB button className is now conditional on its own existing `jobPageMatch` check: `bottom-1.5 lg:bottom-6` on job-detail routes (vertically centers with `MobileApplyBar`, confirmed via matching `getBoundingClientRect()` centers), plain `bottom-6` everywhere else. Do not change the FAB's default offset for other routes without checking whether anything else expects `bottom-6`.
- **Scroll-aware tab overflow** (`Tabs.tsx`) — the `role="tablist"` row now measures real `scrollLeft`/`scrollWidth`/`clientWidth` (on mount, on scroll, and via `ResizeObserver`) and renders an edge fade (`bg-gradient-to-{l,r} from-surface to-transparent`) plus a small tap-to-scroll chevron button, only on whichever side actually has more content, `sm:hidden` (desktop's `sm:w-fit` row never overflows). Don't hardcode a static always-visible fade/arrow on a tab row — it should only appear when there's real overflow, or it misleadingly implies more content on a set that already fits.
- **`<SectionModal>`** (`components/profile/SectionModal.tsx`, previously profile-editing-only) gained optional `saveLabel`/`savingLabel` props — default to the original "Save changes"/"Saving…" so every existing caller is unchanged. Pass these when the modal's action isn't literally "saving a change" (e.g. `saveLabel="Send report"` for `SupportTab.tsx`'s feedback form).

### Signal design primitives (`.btn-signal`, `.ai-hero-card`, `.ai-eyebrow-dot`)

Files: `app/globals.css` (definitions), applied at ~35 real call sites across every consumer-facing page — see `context/RESUME.md`'s Phase 24 entry for the full list, don't re-derive it from scratch.
Route: sitewide (Signal redesign branch `feature/signal-redesign`, not yet merged as of this writing — check whether it has been before assuming these classes are live in whatever branch you're on)
Last updated: 2026-08-25 (Phase 24). Real, reusable primitives — match these exactly rather than hand-rolling a similar gradient/glow inline.
- **`.btn-signal`** — the premium primary-button treatment (gradient fill + layered inset/outer glow + hover lift + press scale). Apply to a button/link alongside its existing sizing/radius/text classes, but **remove** `bg-accent` and any `hover:opacity-*`/`transition-opacity` from that same element first — `.btn-signal` supplies its own background, shadow, and transition. Reserved for the genuinely *primary* action on a given surface — do not apply to secondary/ghost/destructive buttons, or to small per-item repeated actions (a "rewrite this one bullet" button, a step-indicator dot) where it would just be visual noise. Uses the new `--ease-out`/`--ease-in-out` @theme tokens (see below), not a hand-rolled curve.
- **`.ai-hero-card`** + **`.ai-eyebrow-dot`** — an agent-teal radial-gradient hero callout with a pulsing status dot. **Superseded as a call-site rule by `<AiReadsCard>` (below) — do not hand-apply these classes to a new AI-content block; use the component.** The earlier note here said this tier should stay rare and that the flat inline callout was correct everywhere else; direct user instruction in Phase 24 pass 2 overrode that — every page's AI-reads block now carries the hero (or compact) treatment.
- **`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`** / **`--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`** — new real easing tokens in the `@theme` block (previously this file had no custom easing curves at all; every transition used a bare `ease`/`ease-in-out` keyword). Use `var(--ease-out)` for anything entering/exiting or a discrete state-lift (hover, button press); reach for `var(--ease-in-out)` only for genuine continuous on-screen movement. Don't add a third parallel easing system — extend these if a new curve is ever needed.
- **`.dim-card-in`** (`EvaluationBreakdown.tsx` only, currently) — a capped staggered-entrance keyframe (opacity+translateY, 280ms, per-card `animationDelay` via inline style, index capped at 8) for a grid of items that all arrive together once per page load. Reasonable to reuse for another "a real data set just loaded" grid, but per the `animate` skill's own frequency gate, do NOT apply broad entrance staggers to anything visited many times a day (Dashboard's own card grid deliberately has none, for exactly this reason).

### Signal structural primitives — rail, icon chip, AI reads (Phase 24, pass 2)

Files: `app/globals.css` (definitions), `components/shared/AiReadsCard.tsx` (component)
Route: `/career` (rails + chips), `/settings` (nav + plan cards), and every page with an AI-reads block
Last updated: 2026-08-25 (Phase 24, pass 2). Pass 1 ported only tokens + `.btn-signal`, so pages still rendered the OLD layout in new colors — direct user feedback. These are the mockup's actual structural patterns, pulled from the Signal mockup source, not re-derived.

- **`<AiReadsCard>`** (`components/shared/AiReadsCard.tsx`) — the one way to render an "AI Navigator reads" block. Two real tiers, both from the mockup: `variant="hero"` (default; `.ai-hero-card`, gradient + glow + pulsing dot) for a page's own AI moment, and `variant="compact"` (`.ai-mini-card`, flat teal tint + static dot) for AI output nested inside an already-dense card — a job result row, a kanban card, the find-jobs drawer. Use compact wherever the block repeats down a list: fifty hero glows is noise, which is exactly why the mockup defines two tiers. Body copy inside goes `text-text-primary` (**not** `text-agent-dark` — that was tuned for the old `bg-agent-light` ground and reads muddy on the hero gradient); keep `text-agent-dark` only for uppercase sub-labels.
- **`.signal-rail` / `.signal-track` / `.signal-dot`** — a flush, single-bordered stack of rows replacing loose `<li>` + tiny-dot lists. Add `.signal-track-top` when a row's body runs to 2+ lines (it's a modifier, not a Tailwind `items-start` override — these rules are unlayered and beat utilities). Hovering a row scales its dot **and blinks it** (`signal-dot-blink`, 900ms) — direct user request. `.signal-track-warm` marks the one genuinely in-motion row: amber dot, ambient `signal-dot-pulse`. `.signal-dot-positive` / `.signal-dot-negative` are filled, settled-outcome dots and deliberately do not animate — only a live row earns motion.
- **`.signal-icon-chip`** — 34px round chip, `--color-surface-secondary` ground, **agent-teal** glyph. Replaces the muted-gray `bg-surface-secondary` + `text-text-secondary` icon pairing on AI-backed tool cards. Teal, not accent, per the app's Agent-content invariant.
- **`.signal-nav-active`** — `inset 2px 0 0 var(--color-accent)` edge marker for an active nav row (Settings rail), instead of a fully-filled accent pill.
- **`.signal-plan` / `-current` / `-featured`** — pricing cards. Current = amber (the user's own state), featured = agent-teal (the scarcity-capped offer); keeping those on different hues is what stops the grid reading as three shouting cards. The plan tag goes on its **own line above** the plan name (`w-fit whitespace-nowrap`) — in a `justify-between` row with the name it wraps into a blob at this column width. Confirmed live.
- **`.signal-meter-track` / `-fill`** — renamed from `.signal-seat-track`/`-fill` (2026-08-25) once the seat-scarcity bar turned out to be the same primitive the dashboard's `SignalProgressBar` needed — generic determinate meter, not seat-specific. Fill uses `transform: scaleX(var(--fill, 0))`, not `width` (a real design-hook flag: animating `width` lays out every frame). Add `.signal-fill-in` alongside it for a fill-from-zero entrance on load (pure CSS via the `--fill` custom property + a keyframe — no JS, so it works inside a server component; the dashboard funnel and this meter both render server-side). Don't add `.signal-fill-in` to a bar whose value changes at *runtime* (the loading-progress bar below) — the animation's own `fill-mode: both` would fight the plain value-change transition.

### Signal loaders, modal, dashboard/job-detail/job-search structural primitives (Phase 24, cont'd — 2026-08-25)

Files: `app/globals.css`, `components/ui/SignalLoaders.tsx`, `components/ui/ConfirmDialog.tsx`, `components/job-details/JobIdentityRail.tsx`, `components/job-details/SectionHeader.tsx`
Route: dashboard, job-detail (`/find-jobs/[id]`), job-search (`/find-jobs`), and anywhere `ConfirmDialog` is used
Last updated: 2026-08-25. See `context/RESUME.md`'s Phase 24 cont'd entry for the full narrative — this is the reusable-pattern summary.

- **`SignalProgressBar` / `AiThinkingCard`** (`components/ui/SignalLoaders.tsx`) — two genuinely different loaders, don't merge them. `SignalProgressBar` is **determinate**: only ever drive it from a real measured `value`/`total`, never a synthetic ticking number. `AiThinkingCard` is **indeterminate** (`.signal-sweep-track`/`-fill` + `.signal-think-icon` pulse) for a single opaque AI call with no honest percentage. Wired into 6 real flows (see RESUME.md) after being approved over the mockup's own loaders on `/preview/loaders` — that preview route still exists, reuse it for the next loader decision rather than building a new comparison page.
- **`ConfirmDialog`** (`components/ui/ConfirmDialog.tsx`) — now takes `tone="danger" | "neutral"` (default `danger`, so all 20 pre-existing call sites are unchanged). `danger` = red button/eyebrow, for genuinely destructive actions. `neutral` = `.btn-signal` amber + a check-in-a-puck (`.btn-signal-icon`), for reversible actions — using `danger`'s red styling on something reversible (a plan downgrade, marking a job unavailable) is a real correctness bug, not just a look, since it makes a safe action look scary. Also takes `eyebrow` (default `"Confirm"`) — pass `"AI Navigator reads"` only on a dialog that's genuinely presenting AI output, never as decoration.
- **`.signal-track`/`.signal-rail` vs. a standalone bordered item** — real gotcha, hit once this session (`JobResultCard.tsx`): `.signal-track` assumes it's a row *inside* a shared-border rail (fixed single-line padding, `align-items: center`, unlayered so it beats conflicting Tailwind utilities even with `!important`-adjacent tricks). Don't reach for it on a standalone two-part card (a main row + a secondary block below it) — write plain `flex flex-col` + `border` + `hover:bg-surface-secondary` instead, matching this app's existing flat-card convention.
- **Dropdown/menu popovers inside a list item MUST be portaled**, never a plain `position: absolute` child, if the item lives inside a normal vertical list. A merely-absolute dropdown has nothing stopping it from painting over whichever sibling sits below it once any `overflow: hidden` on the ancestor is removed (and removing that `overflow-hidden` is often the *right* fix for a different, earlier clipping bug — confirmed live, both bugs hit in sequence on `JobResultCard.tsx`). The proven recipe already exists twice now: `JobActionBar.tsx`'s `StatusMenuPanel` and `JobResultCard.tsx`'s `MoreOptionsMenu` — both `createPortal` to `document.body`, `position: fixed` computed from the trigger's own `getBoundingClientRect()` at click time, close on outside-click/Escape/scroll. Copy one of these two verbatim for the next dropdown-in-a-list, don't re-derive it.
- **`JobIdentityRail.tsx`** — sticky (`lg:sticky lg:top-24`) right-column identity card for job-detail: title, match score (`.signal-meter-fill` + `.signal-fill-in`), a compact `<dl>` of salary/location/type/found, and the page's one Apply button. **Known open question**: the approved Signal mockup's own job-detail page has no sidebar at all (single column, compact header row) — this rail was built before that mockup section had been read this session. Not yet reconciled; see RESUME.md.
- **`SectionHeader.tsx`** — icon-chip (neutral `bg-surface-secondary`/`text-text-secondary`, **not** agent-teal — this is structural, not AI content) + `font-display` title, matching the icon-chip+title pattern Career's own cards (`StarVault`, `MarketReadiness`) already used. Tried once as a jump-nav pill row above these headers instead — explicitly rejected as redundant decoration and fully removed; don't reintroduce a pill-style in-page nav for this page without a new, specific request for it.

### Hide Reason Panel (job detail)

Files: `components/job-details/JobActionBar.tsx` (`HideReasonPanel`)
Route: job detail page, opens from the Hide button
Last updated: 2026-08-20. Same portal/fixed-position idiom as `StatusMenuPanel`/`NotePromptPanel` in the same file (`glass-panel-strong`, click-outside + scroll-to-close). Quick-pick text buttons, plain `text-text-secondary hover:bg-surface-secondary` rows — no accent/agent tinting, this is a neutral utility prompt, not AI content or a primary action.

### Editor Usage Meter (document editors)

Files: `components/documents/EditorUsageMeter.tsx`
Route: header row of `ResumeWorkspace.tsx` and `CoverLetterWorkspace.tsx`
Last updated: 2026-08-20. Plain `font-mono text-[11px] text-text-muted` (matches the "Updated Xm ago" label next to it), flips to `text-warning` at ≤1 remaining. Reuses `actions/usageStats.ts`'s `getUsageStats()` — no new action.

### Share Job Link (job detail)

Files: `components/job-details/ShareJobLink.tsx`, public render at `app/share/[token]/page.tsx`
Route: job detail page, next to `AddToCompareButton`
Last updated: 2026-08-20. Idle state is a plain `border-border` secondary button (`Link2` icon), same shell as `AddToCompareButton`'s idle state. Active state is a `border-accent bg-accent-muted` pill with a truncated `font-mono text-xs text-accent` URL + Copy/Revoke icon buttons — accent, not agent, since generating/copying a link is a user action, not AI output. The public `/share/[token]` page itself reuses `EvaluationBreakdown.tsx` unmodified and opens with the standard Agent-Content Callout (`border-agent bg-agent-light`, "AI Navigator reads") to frame the page as showing AI evaluation output, not a job listing.

### ATS Checker form (public, /ats-checker)

Files: `components/tools/AtsCheckerForm.tsx`
Route: `/ats-checker` (public, no login)
Last updated: 2026-08-19. Two side-by-side textareas (`grid sm:grid-cols-2`) matching this app's plain form-field convention (`border-border bg-surface`, `focus-visible:border-accent`). Score ring is plain large text, not an SVG ring — color keys off score tier (`text-success`/`text-warning`/`text-error`) same thresholds as elsewhere in the app. Result card reuses the standard `rounded-2xl border border-border bg-surface p-6 shadow-card` section shell. The closing CTA card is the one deliberately agent-toned element (`border-agent/30 bg-agent-light/40`) — it's pitching the AI-driven authenticated product, everything above it is plain utility UI.

### Email Drafts (job detail)

Files: `components/job-details/EmailDrafts.tsx`
Route: job detail page, below Application Documents
Last updated: 2026-08-19. Type-picker pills (`bg-accent`/`border-border` toggle group, same convention as `ReferralsTab`'s channel picker) + a `bg-agent-light text-agent-dark` Generate button (this app's standard AI-draft-CTA treatment). Result card is a plain `bg-surface-secondary` box with per-field (subject/body) Copy buttons, same copy-with-Check-icon-flip pattern as `ExtensionTab`'s API key copy.

### Negotiation Script (job detail, offer-stage)

Files: `components/job-details/NegotiationScript.tsx`
Route: job detail page Overview tab, right after `LeverageSynthesizer`, same `application_status === "offered"` gate
Last updated: 2026-08-19. Identical shell/treatment to `LeverageSynthesizer.tsx` (border-agent/bg-agent-light "AI Navigator reads" block) — deliberately matching since this is genuinely a continuation of that same synthesis, not a new visual language.

### Requirement Decoder (job detail)

Files: `components/job-details/JobDescriptionDecoder.tsx`
Route: nested inside `Qualification.tsx`, below the Required/Preferred columns
Last updated: 2026-08-19. Per-requirement `bg-surface-secondary` rows, classification pill uses `bg-accent-muted text-accent` for must-have vs plain `bg-surface-secondary text-text-muted` for likely-padding — deliberately NOT warning/error-toned, since "likely padding" isn't a problem to fix, just a read.

### Outreach Message button (Insider Connections)

Files: `components/job-details/OutreachMessageButton.tsx`
Route: `InsiderConnections.tsx`'s `PersonRow`, next to the email-lookup button
Last updated: 2026-08-19. Same small-icon-button-with-popover shape as `EmailLookupButton.tsx`, but agent-toned (`border-agent/40 bg-agent-light`) since the button itself triggers AI generation (the email-lookup button is a plain data lookup, not AI).

### Credits & Usage tab (Settings)

Files: `components/settings/CreditsUsageTab.tsx`
Route: `/settings`, replaces the old `NotYetAvailable` placeholder for the `credits` tab
Last updated: 2026-09-14 (Phase 54). Two sections. **This month** (`rounded-2xl border border-border bg-surface p-5` card): insider connections, company research, email lookups — shown to every plan, admins included, not only paid ones. **Today**: EVERY metered action (34), grouped under `text-xs font-medium text-text-muted` subheads (Jobs & search / Résumé & documents / Interview prep / Strategy & career / Outreach & Navigator), zero-count rows kept but receding (`text-text-muted` label). One `UsageLine` renders four states: a finite cap = thin bar, `bg-accent` fill flipping to `bg-warning` + `text-warning` count at ≥80%; `null` limit = "N today · unlimited", no bar; tracked-only work = "N today · counted, not limited", no bar; `0` = "not included in your plan". Counts are `font-mono` (data). Copy names the plan and the reset timezone ("Daily limits reset at midnight in your timezone (America/Toronto)"); admins read "no limits, but every AI action is still counted". Still plain account data — no agent-teal anywhere. Paired with the render-nothing `components/shared/TimezoneSync.tsx`, mounted in the authenticated `Navbar`.

### Success story drafts queue (admin, /admin/marketing)

Files: `components/admin/SocialDraftsQueue.tsx`
Route: `/admin/marketing`, below the Push broadcast form
Last updated: 2026-08-19. Card list, same `rounded-xl border border-border bg-surface-secondary p-4` per-item shape as other admin queue rows. Status pill uses agent-teal (`bg-agent-light text-agent-dark`) for "Approved" since this is genuinely AI-generated content (per the standing Rejection Radar color-invariant lesson), neutral gray for pending, `error`-toned for rejected. Approve/Reject buttons only when `status === "pending_review"`; Mark posted/Discard only when `"approved"`.

### Outreach signal enrichment settings (admin, /admin/marketing)

Files: `components/admin/OutreachSignalSettingsCard.tsx`
Route: `/admin/marketing`, bottom card
Last updated: 2026-08-19. Same wired-but-inert status-pill pattern as any other "needs a real key" admin card in this app — `bg-agent-light text-agent-dark` when `ENRICHMENT_API_KEY` is actually set (read live from env, never a DB toggle), `bg-surface-secondary text-text-secondary` otherwise. Provider picker is a two-pill toggle group (`bg-accent text-accent-foreground` selected, `border border-border text-text-secondary` unselected) — same convention as `ReferralsTab`'s channel picker.

### Referrals overview (admin, /admin/marketing)

Files: `components/admin/ReferralsOverview.tsx`
Route: `/admin/marketing`
Last updated: 2026-08-19. Plain admin table card, exact same shape as `ContentList.tsx`'s pages table (`bg-surface-secondary` header row, `border-t border-border` rows). Total-count pill uses `bg-agent-light text-agent-dark`.

### Referrals tab (Settings)

Files: `components/settings/ReferralsTab.tsx`, mounted via `SettingsPanel.tsx`'s `referrals` tab key
Route: `/settings`
Last updated: 2026-08-19. Link-and-copy row matches `ExtensionTab`'s API-key-copy affordance exactly (`code` in a bordered pill + a small `bg-accent` Copy button with a Check-icon success flip). Two-stat grid below it (`grid grid-cols-2 gap-3`) — one plain `bg-surface-secondary` tile, one `border-agent/30 bg-agent-light/50` tile for the AI-boost stat (agent-adjacent since it affects AI usage limits). Channel picker + "Generate with AI" button reuse the `bg-agent-light text-agent-dark` treatment for the generate CTA (matches every other AI-draft button in this app, e.g. Content's "AI first draft").

### Outreach signal card (job detail, Company tab)

Files: `components/job-details/OutreachSignal.tsx`
Route: job-detail page, Company tab, between `StrategicMoatBriefing` and `InsiderConnections`
Last updated: 2026-08-19. `border-agent/30 bg-agent-light/40` card — agent-toned since it's a real, AI-adjacent hiring signal, not a plain data card. Renders `null` entirely when there's no real signal (`signal.trending` false) — no empty state shown, matching `NetworkSignals`' own "render nothing if there's nothing real to show" convention.

### Saved Jobs Active/Closed tabs

Files: `components/shared/SavedJobsTabs.tsx`
Route: `/saved-jobs`, replacing the old flat card list
Last updated: 2026-08-19. Two tabs (`TabButton`, same `border-b-2 border-accent text-accent` active-state convention as Practice Sandbox's Result/Console tabs) splitting jobs by `getListingSignal(job) === null` (Active) vs not (Closed) — zero new data, reuses the signal already computed for the existing Closed/Stale badges.

### "Why I Left" reflection (job detail)

Files: `components/job-details/WhyILeftReflection.tsx`
Route: job-detail page, rendered only when `job.application_status === "rejected"`
Last updated: 2026-08-19. Private, non-AI card — two blur-to-save textareas ("What I'd want again" / "What to avoid next time") over new `jobs.reflection_loved`/`jobs.reflection_avoid` columns. Plain `border border-border bg-surface` card, no agent styling (this is the user's own words, not AI output).

### Market Readiness (/career)

Files: `components/career/MarketReadiness.tsx`, `lib/marketReadiness.ts`, `actions/marketReadiness.ts`
Route: `/career`, between `BragDocGenerator` and `CareerTimeline`
Last updated: 2026-08-19. Exact same card recipe as `BragDocGenerator.tsx` (`rounded-2xl border border-border bg-surface p-6 shadow-card`, icon-in-circle + `h2` header, `bg-accent` opt-in button) but simpler — no date-range inputs, one button ("Check my market readiness" → "Check again" once a result exists). Result renders in the standard Agent Content Callout (`border-l-2 border-agent bg-agent-light`, `text-agent-dark` label + body) since it's genuinely AI-synthesized, same as Brag Doc's summary line.

### Admin Dashboard (internal, /admin, /admin/users, /admin/users/[userId])

Files: `components/admin/{AdminDashboard,TrendChart,AiKillSwitch,UsersTable,UserDetailView}.tsx`, `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/users/page.tsx`, `app/admin/users/[userId]/page.tsx`
Route: gated by `lib/admin/auth.ts`'s `requireAdmin()` — not linked from the main app nav anywhere, deliberately
Last updated: 2026-08-19 (v1.1; superseded by the persistent sidebar shell below — the "distinct minimal header" description below is now stale, kept for the still-accurate content-area detail). `AiKillSwitch` sits at the very top of `/admin` — a `rounded-2xl border p-6 shadow-card` card that swaps to `border-error/30 bg-error/5` when AI is disabled, `Zap`/`PowerOff` icon in a colored circle, `ConfirmDialog` gates turning it off (never turning it back on). 3 `StatCard`s (`border border-border bg-surface shadow-card rounded-2xl p-6`, `font-mono text-3xl` value) in a `sm:grid-cols-3` row. Two `TrendChart`s (recharts `LineChart`, same card/axis/tooltip conventions as `components/dashboard/AnalyticsCharts.tsx`'s `MatchDistributionChart` — `var(--color-*)` tokens throughout, never raw hex) side by side on `lg:grid-cols-2`; the usage-trend line deliberately uses `var(--color-info)`, NOT `var(--color-agent)` (agent-teal is reserved for genuinely AI-generated content, not "this chart is about AI usage" theming — a real mistake caught before shipping v1). Leaderboard/user tables reuse `ResumeManager.tsx`'s exact table classes (`bg-surface-secondary` header row, `font-mono text-[10px] uppercase tracking-wider text-text-muted` header cells, `border-t border-border` body rows) wrapped in `overflow-x-auto` (not a full mobile-card fallback — acceptable per this app's own mobile-responsive rule, which allows horizontal scroll as a lighter alternative for genuinely internal-only surfaces). Status badges: `bg-error/10 text-error` (Suspended), `bg-warning/10 text-warning` (High usage, ≥100 combined daily AI actions), plain `text-text-muted` (Active). Suspend uses `ConfirmDialog.tsx` (destructive-action pattern); Unsuspend is a plain button, no confirm needed.
`UsersTable` (`/admin/users`) adds a search input (`Search` icon inset in the field, matching this app's other search-field convention) and Prev/Next pagination controls (`ChevronLeft`/`ChevronRight`, disabled at the boundaries). `UserDetailView` (`/admin/users/[userId]`) is the "God-Mode Read-Only View" — header card with identity/location/join-date/job-count plus the Suspend and usage-multiplier controls inline, a `TrendChart` for that one user's 14-day usage, and an admin-notes card (textarea + Add button, notes render as `rounded-xl border border-border bg-surface-secondary p-3.5` cards with an "email · timestamp" byline). All timestamps in this whole admin surface use an explicit `hour12: false` 24-hour clock (a real hydration-mismatch bug was caught and fixed here — 12-hour `toLocaleString` diverges between server/client ICU implementations even with an explicit locale; the fix removes the dayPeriod token entirely rather than fighting the divergence).

### Admin Sidebar (internal, all /admin/* routes)

File: `components/admin/AdminSidebar.tsx`, mounted once in `app/admin/layout.tsx`
Last updated: 2026-08-19 (Phase 17). Replaced the old header-only shell — a persistent `w-56` vertical icon+label nav (`bg-overlay text-overlay-foreground`), Shopify-shaped per direct user request, once a 4th top-level admin page made URL-only navigation untenable. `NAV_ITEMS` is a flat array (`href`/`label`/`icon`/`exact`); active state via `usePathname` (`exact` match for Home, `startsWith` for every section). **Rule: only add a nav item once its page actually ships** — don't link ahead of what's built. Currently: Home, Users, Team & Roles, Expenses.

### Team & Roles (internal, /admin/team)

Files: `components/admin/TeamRoster.tsx`, `app/admin/team/page.tsx`, `lib/admin/auth.ts`'s `requireRole()`, `lib/admin/queries.ts`'s `listAdmins()`
Route: gated the same as the rest of `/admin`, plus a `requireRole()` check per write action
Last updated: 2026-08-19 (Phase 16). Hardcoded 3-tier permission enum (`owner`/`admin`/`support_readonly`), not a permission-matrix builder — the right size for a 2-5 person team per real `agy` research. Only `owner` sees the invite form and Revoke buttons; everyone else gets a read-only roster matching their own actual permissions. Role chips: `bg-accent-light text-accent` (owner), `bg-info-light text-info` (admin), `bg-surface-secondary text-text-secondary` (support_readonly) — same chip recipe reused in the role-description cards below the table. "Invite" is really "grant an existing Sortie account admin access," no separate invitation-email flow — a real account must already exist. Last-owner removal is blocked with an inline "Can't remove last owner" label instead of a button.

### Résumé workspace — AI Rewrite / Editor / Style (internal, /resume/tailored/[jobId], /resume/[id])

Files: `components/documents/{ResumeWorkspace,ResumeSlotWorkspace,AIRewriteTab,EditorTab,ActionPlan,ATSAuditCard,FrameworkBar,FrameworkPicker,FrameworkRewritePanel,PlaceholderFixPanel,RefinementChips,ResumeLivePreview,ResumePDF,DocumentChatEditor}.tsx`, `components/documents/useDocumentChat.ts`, `lib/{atsMatchRate,atsSkills,atsAutoFix,resumeFrameworks,writingStyle}.ts`
Last updated: 2026-09-15 (Phase 56).

**Phase 56 Style tab and preview patterns:**
- **Template picker:** 2–4 column grid in `TEMPLATE_ORDER` (Professional, Early Career first). Each card = schematic thumbnail + label + ATS chip: `bg-success/10 text-success` with `ShieldCheck` ("ATS-safe") or `bg-warning/10 text-warning` with `TriangleAlert` ("Higher risk"). Description line below the grid; risky templates add a Workday/Taleo note.
- **Section-order offer:** after picking a preset template, a `rounded-lg border border-border bg-surface-secondary p-3` card with `ListOrdered` icon, the recommended order, and "Use this order" (`bg-accent`) / "Keep my order" (outline) buttons.
- **Font & sizes group (open by default):** font `Dropdown` with the category as a muted hint on each option; Small/Medium/Large segmented preset; `SizeControl` rows inside a bordered box — label left, `Minus` button, `pt` number input (font-mono, no spinners, commits on blur/Enter), `Plus` button, full-width range slider (0.5pt steps); Name style segmented (Normal / CAPITALS).
- **Layout group adds:** Skills layout (Theme/Chips/Grid/Bullets/Grouped), Job header (Job title first / Company first), Certifications (List / One line). Spacing sliders show real units; margins show pt and inches.
- **Editor additions:** Skill groups (group name input + TagInput per group, "Add skill group"), job Location, education Location + Start/Graduation year pair, custom-entry details and link inputs (full width), Key highlights section (TagInput + real-figures note), bold-markup tip under the summary.
- **Live preview page badge:** `absolute bottom-3 left-3` pill, `font-mono text-[11px] shadow-card bg-surface`; neutral border for 1 page, `border-warning/40 text-warning` when more than one.
- **Document rendering (PDF/DOCX):** compact centered header for Professional/Early Career (capitalized navy name, pipe-separated contact line, Professional's full-width accent rule under contact, Early Career's underlined email and bold highlights strip); compact section titles (0.75pt accent rule); grouped skills "**Label:** a, b"; company-first roles with italic navy title line.

**Phase 55 layout and patterns:**
- **Size**: page `max-w-[1400px]` (matches the Navbar's own width), workspace row `lg:h-[max(760px,calc(100dvh-13rem))]`, preview and panel an even `1fr/1fr` split; tab labels `text-sm`.
- **Chat dock**: `DocumentChatEditor docked` sits OUTSIDE the panel's scroll area, below it, on every tab (`shrink-0 border-t bg-surface px-5 pb-4 pt-3`). Header row = `font-mono` uppercase "Refine with AI · N messages" + a "Hide/Show history" toggle; thread `max-h-64`, auto-scrolls to the newest item. User bubbles `bg-accent-muted` right-aligned (`max-w-[85%]`); assistant replies keep the agent treatment (`border-l-2 border-agent bg-agent-light text-agent-dark`). Pending = `Loader2` + "Revising your résumé…".
- **Limit refusal in the thread**: `rounded-lg border border-warning/30 bg-warning/5` with a `Lock` icon, the server's message, "That message wasn't applied — nothing in your résumé changed", and a `text-accent` "See upgrade options" link reopening `LimitReachedModal`. Deliberately NOT agent-toned — the app is speaking, not the AI.
- **Shared chat state**: inside the workspace, `ActionPlan`/`RefinementChips` suppress their own error line, modal and "What changed" card (`isShared`), because the dock shows them once. Standalone uses keep them.
- **ATS skill chips**: under the Hard/Soft skills meters, "Missing:" chips `bg-warning/10 text-warning` and "Found:" chips `bg-success/10 text-success`, both `rounded-full px-1.5 py-0.5 text-[10px]`. Deterministic data, so never agent-toned. The footer line reads the counts from the re-checked result, not the raw AI keyword list.

**Layout.** The two-column grid carries ONE definite height (`lg:h-[720px]`) and both columns fill it, each scrolling inside itself. Previously each column sized itself independently — a hard-coded 700px `PDFViewer` beside a freely-growing editor panel — so the row stretched to whichever was taller and left a dead patch under the shorter one. Both sides were reported by the user, one after a first fix that only unbounded the panel and therefore moved the gap rather than closing it. The previews now fill their container (`h-full min-h-[420px]`) instead of declaring a height. Same structure in the slot and cover-letter workspaces. **Not visually verified** — see RESUME.md.

**Export bar is sticky** (`sticky bottom-0`) at the foot of the workspace: Download PDF / DOCX / Markdown, Regenerate, History. These are EXPORT actions, not save — saving is automatic via debounced `commitSections`/`commitStyle`, surfaced as "Saving… / Updated" in the workspace header. It read as missing purely because it sat below a long scrolling panel.

**`FrameworkBar`** — the opt-in writing frameworks, rendered above the Action Plan on AI Rewrite and again at the top of the Editor tab. Three steps: framework → bullet → that framework's questions. Each framework shows its expansion and its **documented weakness at choosing time**, so a framework that is wrong for someone's level (SOAR on a junior role) can be avoided before committing. Step 2 repeats the formula and states that the listed bullets are the INPUT — a user seeing their existing bullets under a "Google XYZ" heading reasonably asked "how is this XYZ?". Step 3 is one labelled input per letter, badged with the slot it fills, carrying a real example as its placeholder; blank means that element is omitted, never guessed.

**`ActionPlan`** — ordered by real point value (`weight − earned` from `computeMatchRate`, so the numbers are arithmetic). Free deterministic fixes first with an `Instant` chip, then one batched AI item for all missing hard skills, then the placeholder row, then bullet issues. Cost is labelled with the real unit read from `DAILY_LIMITS` (`1 of 10/day`) — an earlier "1 AI credit" was removed because no credit system exists. The assistant's reply renders in `AiReadsCard` (compact), never a hand-rolled callout.

**`PlaceholderFixPanel`** — one workspace for every bullet still holding a bracketed blank, with the blank highlighted in place and an input beside it. Replaced seven identical truncated Action Plan rows. Leaving an input empty rewrites that bullet without a number rather than keeping the blank. A framework dropdown applies to the whole batch and defaults to "Keep as written".

**`ATSAuditCard`** — Jobscan-shaped: one score plus three labelled category meters (searchability / hard skills / soft skills) from `computeMatchRate`, which is now the SINGLE scoring source shared with the Action Plan. Two different systems previously ran side by side and disagreed by nine points in public. The headline label names WHICH problem the score has — a parsing problem is a "risk", a keyword shortfall is a "match" problem — because a résumé with flawless 30/30 searchability was being labelled "High risk", which sends someone to fix the wrong thing.

**Agent-token invariant, enforced both ways.** `ui-tokens.md` reserves agent-teal exclusively for AI-generated content, and the rule runs in both directions. The Action Plan's AI reply had no agent treatment at all (fixed: `AiReadsCard`); the ATS card's "no formatting issues" block wore agent-teal despite being pure deterministic computation (fixed: success tone). Still outstanding: `components/profile/ProfileForm.tsx` uses `border-agent` as a decorative timeline rail on user-entered education — the same violation, left alone as decorative.

### Expenses (internal, /admin/expenses)

Files: `components/admin/ExpensesDashboard.tsx`, `app/admin/expenses/page.tsx`, `lib/admin/expenses.ts`, `lib/admin/vendorCosts.ts`
Route: gated the same as the rest of `/admin`; add/remove expense gated `owner`+`admin`, rate edits gated `owner`-only (same tier as the AI kill switch)
Last updated: 2026-09-10 (Phase 52, section 2). **The page is now organized by how well each number is KNOWN, not by which table it came from** — that reframing is the whole redesign. Four `StatCard`s, each carrying a Measured/Estimate/Entered chip (`bg-success/10 text-success` for measured, `bg-surface-secondary text-text-muted` otherwise): measured vendor spend, estimated AI/API cost, entered fixed costs, and an approximate burn that sums all three and says so. A `Measured` chip is only ever rendered when the figure came back from that vendor's own API on this request — never for a plausible-looking zero, which is exactly what made the old page wrong.
New `Vendors` table above the rate table, fed by `lib/admin/vendorCosts.ts`: one row per external service with status icon (the same `STATUS_STYLES` vocabulary as `SystemHealthPanel`, deliberately shared so an operator doesn't learn two colour languages), plan, what it's billed on, spend, and free-credit percentage with `text-warning` at 70% / `text-error` at 90%. Vendor metadata is a code constant, not a table — which vendor bills on what is engineering knowledge that changes with the code, while the dollar amounts an admin genuinely owns stay in `business_expenses`.
An admin-share banner renders above the tables whenever any metered call in the window came from an `ADMIN_EMAILS` account, because pre-launch that is ~100% of it and a reader could otherwise mistake owner testing for customer demand. The rate table gained a `No rate set` warning chip (an unpriced action and a genuinely free one both used to render as `$0`) and an inline `(n admin)` count beside each call count.
Previously (2026-08-19, Phase 17): Same 3-`StatCard` row convention as `/admin`'s home dashboard. Two tables below: hand-entered `business_expenses` (name/category/amount/cadence, add form + Remove with `ConfirmDialog`) and a per-`UsageAction` `ai_cost_rates` estimate table (rate/provider inline-editable per row, gated on an actual dirty-check before the Save button enables, sorted by estimated 30-day cost descending). Currency helper switches to 3-decimal display (`$0.005`) for sub-dollar amounts rather than rounding to `$0.00` — most real per-call rates here are fractions of a cent. Every `UsageAction` renders even with a $0 rate (free-tier Gemini actions) rather than being silently omitted, matching this app's honesty-in-UI convention.

### Content / CMS (internal /admin/content, public /blog, /blog/[slug])

Files: `components/admin/{ContentList,PageEditor}.tsx`, `components/shared/MarkdownContent.tsx`, `app/admin/content/{page,new/page,[id]/page}.tsx`, `app/blog/{page,[slug]/page}.tsx`, `lib/admin/content.ts`, `actions/adminContent.ts`
Route: admin side gated the same as the rest of `/admin`; `/blog`/`/blog/[slug]` are public, unauthenticated `Navbar`+`Footer` shell
Last updated: 2026-08-19 (Phase 17). `PageEditor` is one component for both new-page and edit-page modes (`initialPage: null` vs a real row is the only branch) — 2-column field grid (Title/Slug/Meta title/Meta description) in a card, then an AI-first-draft row (`Sparkles` icon button, gated owner+admin, calls Gemini via `lib/models.ts`'s existing `complete()` helper — same pattern as Brag Doc/Market Readiness, deliberately NOT usage-metered since this is internal admin tooling not a consumer feature), then a 2-column `lg:grid-cols-2` Markdown-textarea/live-Preview split. Save/Publish-Unpublish/Delete button row only renders for `owner`/`admin` — `support_readonly` sees every field `disabled` for a genuine read-only view, not just hidden buttons.
`MarkdownContent.tsx` is the one shared render path between the admin preview pane and the real public page — no `@tailwindcss/typography` plugin (not installed in this project), every markdown element hand-mapped to this app's own tokens (`text-primary`/`text-secondary`/`text-muted`/`accent`/`border`) via `react-markdown`'s `components` override prop, so what an admin previews is exactly what ships, not two drifting renderers.
`ContentList` (`/admin/content`) reuses the exact table classes from every other admin list (`bg-surface-secondary` header row, `font-mono text-[10px] uppercase tracking-wider text-text-muted` header cells) with a `bg-agent-light text-agent-dark`/`bg-surface-secondary text-text-secondary` Published/Draft chip pair — same chip recipe as Team & Roles' role badges.
Public `/blog` (index, published-only list, publish-date subline) and `/blog/[slug]` (single post, `generateMetadata` reading `meta_title`/`meta_description` with a `"{title} — Sortie"` fallback) both use the same plain `<Navbar /><main><Footer /></main>` shell as the homepage — no admin chrome leaks into the public-facing pages. A draft page's slug 404s on the public route (live-verified) rather than leaking through an unguarded read.

### Support (internal /admin/support inbox + Settings "Contact support" tab)

Files: `components/admin/{SupportInbox,SupportTicketDetail}.tsx`, `components/settings/SupportTab.tsx`, `app/admin/support/{page,[id]/page}.tsx`, `lib/admin/support.ts`, `actions/{support,adminSupport}.ts`
Route: admin side gated the same as the rest of `/admin`; user side is a new tab in `SettingsPanel.tsx` (Settings → Contact support), not a standalone page
Last updated: 2026-08-19 (Phase 17). Status chip 3-tuple reused identically on both the admin and user side: `bg-warning/10 text-warning` (Open / "Open"), `bg-info-light text-info` (Pending / "Awaiting reply" — same color, different label per audience), `bg-agent-light text-agent-dark` (Resolved). `SupportInbox` (`/admin/support`) is a pill-filter row (All/Open/Pending/Resolved) over the standard admin table classes. `SupportTicketDetail` is a header card (status chip + Mark-Open/Pending/Resolved + Assign-to-me buttons, gated owner+admin — `support_readonly` sees the same page with zero write buttons) above a message thread (`border-accent/20 bg-accent-light/40` for admin messages, plain `bg-surface-secondary` for user messages) and a reply box. Every write handler refetches the full ticket detail afterward rather than hand-patching local state — a real bug was caught live where a reply's `assigned_admin_id` write wasn't reflected until reload because the original code only patched `status` locally.
`SupportTab.tsx` (user side) is a single component that swaps between a ticket-list view (new-ticket form + a clickable list of the user's own tickets) and a thread view (back button, messages, reply box) based on local `selectedId` state — no route change, matching the rest of `SettingsPanel`'s tab-swap pattern. Messages are labeled "You"/"Sortie support" rather than raw author types.
Extended same day: `components/admin/NewSupportTicketForm.tsx` (`/admin/support/new`) lets an admin log a ticket on behalf of a real Sortie account (email/subject/opening-note form, same "must already exist" pattern as Team & Roles' invite). `SupportTicketDetail`'s action row gained a real `<select>` reassign dropdown (replacing the earlier "Assign to me"-only button) sourced from the admin roster, plus a `Trash2`-icon Delete button (`ConfirmDialog`-gated, owner+admin). Outbound admin replies also attempt a real email via `lib/email/resend.ts` (Resend), and `app/api/webhooks/resend-inbound/route.ts` can turn a real inbound email into a ticket — both genuinely wired but inert until a domain is verified in Resend, see that file's own comment for the exact activation steps.
Extended again same day: the subject line in `SupportTicketDetail`'s header is now click-to-edit (`Pencil` icon → input + Save/Cancel). `components/admin/SupportDashboardStats.tsx` sits atop `/admin/support`'s inbox — a 6-card stat row (Open/Pending/Resolved counts, avg. first-response, oldest-open age, SLA breach count) reusing the plain `StatCard` recipe from `ExpensesDashboard`/`AdminDashboard`, except the breach card gets `border-error/30 bg-error/5` treatment only when its count is nonzero. The Reply box gained a `Sparkles` "AI draft reply" button next to its label, grounded in the full real ticket thread — live-tested and found to occasionally invent a plausible-sounding but ungrounded specific fact (a file-size limit not present in the thread), a real disclosed LLM-adherence gap, not a code bug — the reason this stays draft-then-review, never auto-send.

### Marketing (internal /admin/marketing)

Files: `components/admin/{MarketingList,BroadcastEditor}.tsx`, `app/admin/marketing/{page,new/page,[id]/page}.tsx`, `lib/admin/marketing.ts`, `actions/adminMarketing.ts`, `lib/inngest/functions.ts`'s `sendMarketingBroadcastAsync`, `app/api/unsubscribe/route.ts`
Route: admin side gated the same as the rest of `/admin`, all writes owner+admin-gated (no `support_readonly` write path here, unlike Support); `/api/unsubscribe` is public/unauthenticated
Last updated: 2026-08-19 (Phase 17). Same list/editor split as Content/CMS — `MarketingList` (eligible-recipient stat card + a `ContentList`-style table with Draft/Sending/Sent/Failed chips), `BroadcastEditor` (subject + markdown textarea/preview split reusing `MarkdownContent.tsx`, disabled entirely once a broadcast leaves `draft`). Send is a real 2-step confirm: the primary button reads "Send to N recipients" (the real live count, not a placeholder) and opens `ConfirmDialog` before calling `sendBroadcast()`, which itself refuses to send without `MARKETING_PHYSICAL_ADDRESS` configured — a real compliance gate, not just a UI warning.
`BroadcastEditor` also has the identical AI-first-draft row `PageEditor.tsx` uses (brief input + `Sparkles` button) — same exact recipe, not a new pattern, reused for email body instead of a CMS page.
Extended same day with real segmentation: `BroadcastEditor`'s Subject field is now paired with an Audience `<select>` showing live per-segment counts inline (e.g. "Active in the last 7 days (3)"), and `MarketingList`'s 3 top stat cards became per-segment counts instead of one flat "eligible recipients" number. Both the Send button and its `ConfirmDialog` reflect the selected segment's real count. The broadcasts table gained Audience/Opened/Clicked columns (the latter two show "—" until a broadcast is actually `sent`).

### Push notifications (Settings tab + /admin/marketing send form)

Files: `components/settings/PushNotificationsTab.tsx`, `components/admin/PushBroadcastForm.tsx`, `public/sw.js`, `lib/push.ts`, `actions/push.ts`, `actions/adminPush.ts`, `lib/inngest/functions.ts`'s `sendPushBroadcastAsync`
Route: `PushNotificationsTab` lives in `SettingsPanel.tsx` as its own tab (separate from the still-unbuilt "Job alerts" placeholder — delivery-channel management, not alert-content logic); `PushBroadcastForm` renders below `MarketingList` on `/admin/marketing`
Last updated: 2026-08-19 (Phase 17). `PushNotificationsTab` is a 4-state component (`checking`/`unsupported`/`unsubscribed`/`subscribed`/`denied`) driving the real browser Notification/Push APIs — no custom permission-prompt UI, the browser's own native prompt handles that. `PushBroadcastForm` is deliberately send-immediately with no draft/edit cycle (unlike `BroadcastEditor`) — title/body/optional-link, `ConfirmDialog`-gated, disabled unless title+body are both filled.

### Admin Navigator (floating AI chat, /admin/* only)

Files: `components/admin/{AdminNavigatorLauncher,AdminNavigatorChat,AdminNavigatorLauncherLoader}.tsx`, `lib/adminAgentAssistant.ts`, `actions/adminAgent.ts`, mounted in `app/admin/layout.tsx`
Route: every `/admin/*` page; consumer Navigator (`components/agent/NavigatorLauncher.tsx`) is explicitly excluded from `/admin/*` via its own `isAdminRoute()` check, so only one floating assistant ever shows per surface
Last updated: 2026-08-19 (Phase 17). Byte-for-byte the same floating-FAB recipe as consumer Navigator (`fixed bottom-6 right-6`, `Sparkles`/`X` crossfade, `animate-in`/`animate-out` panel, click-outside + Escape to close, `ssr:false` dynamic loader for the same documented Server-Component-root-mount gotcha) — deliberately reused, not redesigned, since the interaction pattern was already proven. The one real difference: no action-proposal cards (consumer's `log_accomplishment` Accept/Discard UI) — v1 is read-only/drafting-only, so message bubbles are plain, no card below the assistant bubble ever renders. Grounded in a snapshot assembled from `getSupportDashboard()`/`getTopUsersByUsage()`/`getExpensesSummary()`/`listBroadcasts()` — the exact same functions the Support/Expenses/Marketing dashboards already call, no new queries.

### Practice Sandbox (inline code editor)

Files: `components/interview/PracticeSandbox.tsx`, `lib/practiceSandbox.ts` (execution engines), `lib/interviewQuestions.ts`'s `PracticeKit` type + `generatePracticeKit()`, `actions/interviewQuestions.ts`'s `getPracticeKit()`
Route: `/interview` and job-detail's Interview Prep Room tab, inside `QuestionBankPanel.tsx`'s Study View — "Practice this question" button appears only under `technical`-category questions, right below the existing "AI reference implementation" card
Last updated: 2026-08-18 (Phase 16). Monaco (`@monaco-editor/react`, the only new npm dependency) loaded via `next/dynamic(ssr:false)`, `theme="vs-dark"`. JS/TS execute in a plain isolated Web Worker; Python/Ruby/SQL each execute via their own WASM port loaded from a pinned CDN version *inside* a Worker via `importScripts` — none are npm dependencies. All 5 share one `runInWorker()` helper with a 15s timeout that terminates the Worker.
**Strict pass/fail grading** (reworked from "soft verification" 2026-08-18, agy critique): a test-case picker (pills, up to 3) now carries a `CheckCircle2`/`XCircle`/`AlertTriangle` verdict icon per test. "Run Tests" grades every test case in parallel against the reference solution as runtime ground truth (`gradeAnswer()` in `lib/practiceSandbox.ts`). Below the editor, a tabbed panel (`TabButton`, active tab gets `border-b-2 border-accent text-accent`) — **Result** tab shows `OutputBlock`s (`bg-surface-secondary` cards, error text in `text-error`) labeled "Expected"/"Your output" plus a `text-success`/`text-error` Passed/Failed line; **Console** tab shows only the candidate's captured stdout, separate from the graded return value. A `reference_error` verdict (the AI's own reference solution broke) falls back to an unlabeled side-by-side with a `text-warning` notice instead of claiming a verdict.
**localStorage persistence**: code is saved debounced (500ms) keyed on `sortie:practice-code:{bankId}:{questionIndex}:{language}`, hydrated on mount via a `useState` initializer reading `window.localStorage` directly (guarded for SSR).
A `border-l-2 border-agent bg-agent-light` disclaimer sits above the test-case picker (this app's standard Agent-Content Callout).

### Dashboard bento-grid (redesign v1 + visual-hierarchy pass v2)

Files: `components/dashboard/AIActionCenter.tsx`, `PipelineFunnel.tsx`, `ActivityHeatmap.tsx`, `UpcomingInterviews.tsx`, `RejectionRadar.tsx`; `lib/dashboardInsights.ts`; `.dashboard-hero-card`/`.dashboard-well` in `app/globals.css`
Route: `/dashboard`, replacing the old `StatsBar`/`CompanyResearchChart`/`JobsOverTimeChart` (all deleted)
Last updated: 2026-08-18 (v2, same day as v1 — researched via `agy` after v1 shipped visually flat). 3-row grid: Row 1 = `AIActionCenter` (lg:col-span-3) + `PipelineFunnel` (lg:col-span-1). Row 2 = `MatchDistributionChart` + `ActivityHeatmap` (lg:col-span-2) + `UpcomingInterviews` (only rendered when interviewing jobs exist, row becomes 3-col instead of 4-col when absent). Row 3 = `RecentActivity` + `RejectionRadar`.
- **v2 principle**: every card had identical visual weight in v1 ("8 gray boxes"). Fixed via token-step hierarchy (accent-tinted border on the hero card, a darker inset "well" for the heatmap), NOT the static ambient-gradient "hero wash" `agy` initially suggested — that exact technique was already tried at the page level and reverted 2026-07-27 after real Raycast reference research found zero ambient gradient wash on its actual UI (see the Liquid Glass section below). See `.dashboard-hero-card`/`.dashboard-well`'s own comment in `globals.css` for the full reasoning, including a 4th confirmed hit of the `color-mix()` Lightning CSS gotcha while building them.
- **AIActionCenter**: `.dashboard-hero-card` (accent-tinted border + inset hairline, `p-8` not `p-6`), `Sparkles` icon in `text-accent` (not `text-agent` — insights are deterministic, not live AI output). A large `font-mono` insight-count number top-right establishes it as the grid's anchor. Rows: `border-warning/20 bg-warning/5 text-warning` or `border-info/20 bg-info-lightest text-info-foreground` depending on `DashboardInsight.tone`.
- **PipelineFunnel**: micro-bars (`h-[3px]`, was `h-2.5` in v1) with an accent glow on the fill (`box-shadow: 0 0 6px color-mix(...)`, inline style — no Lightning CSS risk since inline styles bypass build-time processing). Label+count sit above the bar, not overlaid. Width scaled to the max stage count, each row links to `/missions?stage={stage}`.
- **ActivityHeatmap**: grid now sits inside `.dashboard-well` (darker inset container) instead of directly on the card surface. Cells `h-3 w-3 rounded-[2px]`; zero-count cells recede to a faint `ring-1 ring-border/40` (was a flat visible `bg-surface-secondary` in v1); top intensity tier gets a lighter `ring-info-light/60` inner ring to read as "lit." Hover updates a header label to `"{count} on {date}"`; no tooltip library.
- **UpcomingInterviews**: plain card list, `CompanyLogo` size `sm`, links straight to the job detail page — no drill-down modal. Unchanged in v2 (deliberately kept "flat/quiet" per the supporting-card principle).
- **RejectionRadar**: v2 added a `border-l-2 border-l-agent` accent (only when real diagnoses exist) and fixed a real color-token bug, not just a v2 polish item — the category badge shows genuinely AI-generated content (`rejection_diagnosis`), so per this app's strict Agent-content Invariant it must render in `bg-agent-light`/`text-agent-dark`, not the `warning`-orange v1 shipped with. Live-verified by temporarily flipping a disposable test job to `rejected` with a real-shaped diagnosis, confirming the badge/border render correctly, then reverting.

### Command Palette (Cmd+K)

File: `components/ui/CommandPalette.tsx`, `components/ui/CommandPaletteLoader.tsx` (ssr:false wrapper, mounted once in `app/layout.tsx`)
Trigger: global `Cmd/Ctrl+K`, or the "⌘K" pill button in `Navbar.tsx` (dispatches a `sortie:open-command-palette` window event — a plain event rather than lifting state/context, since `CommandPalette` is the only listener)
Last updated: 2026-08-18. Same modal recipe as `ConfirmDialog.tsx` (`bg-black/40 backdrop-blur-sm` scrim + `glass-panel-strong` card, `animate-in fade-in-0 zoom-in-95`), but top-anchored (`pt-[12vh]`) rather than centered — standard command-palette positioning. Groups: "Navigate" (all top-level routes) and "Actions" (Settings, theme toggle). Plain case-insensitive substring filter on label + a `keywords` field (no fuzzy-match library). Full keyboard nav: ↑↓ moves the highlighted row (also mouse-hover-synced), Enter runs it, Escape closes. **Real bug caught and fixed during verification**: an early version's Escape/Cmd+K-to-close handlers set `open` false directly without resetting `query`/`activeIndex`, so a query typed before closing was still there — silently prepended onto — the next time the palette opened. Both handlers now always reset all three fields on close, confirmed live via a re-open check.
State-reset pattern: uses the "adjust state during render" idiom (`Navbar.tsx`'s own `pathname !== prevPathname` check is the precedent) to reset `activeIndex` when `query` changes, not a `setState`-in-effect — the project's eslint config actively flags the effect-based version as an error.

### Apply Verdict (job detail, top of page)

File: `lib/applyVerdict.ts` (`computeApplyVerdict`), `components/job-details/ApplyVerdict.tsx` (`ApplyVerdictBadge`)
Route: job detail page (`/find-jobs/[id]`), first element on the page, above `JobActionBar`
Last updated: 2026-08-18. Deterministic (no AI call) — synthesizes `overall_grade`/Legitimacy dimension/`title_scope_mismatch`/listing-staleness into one `apply`/`consider`/`long-shot`/`skip`/`unscored` tier. Reuses Match Score Colors tiering: `bg-agent-light text-agent-dark` (apply), `bg-surface-secondary text-text-primary` (consider), `bg-warning/10 text-warning` (long-shot), `bg-error/10 text-error` (skip), `bg-surface-secondary text-text-muted` (unscored). Icon per tier: `CheckCircle2`/`HelpCircle`/`AlertTriangle`/`XCircle`/`HelpCircle`.

### Company logo — initial tile fallback (Phase 50)

File: `components/shared/CompanyLogo.tsx`
Route: everywhere `CompanyLogo` renders — `JobResultCard`, job detail, `UpcomingInterviews`, Kanban cards
Last updated: 2026-09-09. Adds a fourth tier below the existing chain (stored `logoUrl` → unavatar → DuckDuckGo): an **initial tile** when nothing resolves. Company initials on a tint chosen deterministically by hashing the name, so an employer keeps the same colour across sessions and devices. Two letters when the name has two real words ("Royal Bank" → RB), one otherwise, skipping articles. Tints come from `TILE_TINTS` — pairs drawn from the app's own semantic tokens (`bg-info-light`, `bg-success-light`, `bg-surface-tertiary`…). **Amber and teal are deliberately excluded**: amber is reserved for user actions and teal for AI content, and a placeholder is neither.

Two fixes ship with it, both load-bearing. `onError` alone could never advance the chain, because a wrong domain 404s **before React hydrates** and the handler is never attached — confirmed live as `complete=true, naturalWidth=0` stuck on candidate 0, which is why so many cards showed an empty grey box rather than any fallback. A mount-time `useEffect` now checks for a loaded-but-broken image and advances. And `extractLikelyLogoDomain` (`lib/applyLinkTrust.ts`) now refuses ATS and aggregator hosts, since reading the domain out of the apply URL gave `myworkdayjobs.com` for every Workday posting and rendered **Workday's own mark** on all of them.

### Job card timing badges (Phase 50)

File: `components/shared/JobResultCard.tsx`
Route: `/find-jobs` results list
Last updated: 2026-09-09. A badge row **above** the title, replacing freshness's old place in the attribute row below it — "posted 57 minutes ago" is the fact that decides whether applying is worth the effort, so it leads rather than sitting among job type and seniority. Freshness pill is `border-success/30 bg-success/10 text-success` inside 24h and `border-border bg-surface-secondary text-text-secondary` after. Beside it, `job.applicant_count` renders LinkedIn's own phrasing verbatim ("Be among the first 25 applicants") — amber-tinted when it reads as encouragement, neutral otherwise — falling back to a time-derived "Be an early applicant" only when no count is stored. Amber is correct here: it is a nudge to ACT, which is exactly what this project reserves amber for.

Nothing else on the card changed. It was redesigned twice this session and **reverted at the user's instruction** — do not redesign it again without an explicit ask and a rendered preview.

### Search filter bar — source, role type, industry, stage (Phase 50)

File: `components/find-jobs/FilterBar.tsx`, `lib/jobFilters.ts`
Route: `/find-jobs`
Last updated: 2026-09-09. Four filters added, all following the existing `FilterPopover` + `CheckboxOption` pattern. **Source** (LinkedIn / Indeed / Direct from employer) sits first on the bar as the coarsest cut; "direct" is the complement of the two aggregators rather than a list of ATS names, so a new integration needs no change. **Role type** (IC / people manager) is read from the title, and the popover says so — "Lead" counts as a manager, "Principal" does not. **Exclude staffing agencies** is a toggle in the All Filters panel, matched on company name. **Industry** and **company stage** live in that panel too and are written by the AI extraction pass.

The rule worth carrying forward: industry and stage **only render when jobs on screen actually carry the field**, and their options are built from those jobs rather than a fixed list. A control that empties the list because a field is unset — rather than because nothing matched — is worse than no control, which is exactly what the visa-sponsorship filter did until this session (it read `about_role`/`requirements`, present on 13 and 9 of 722 rows).

### Job source badge (JobResultCard / KanbanCard)

File: `lib/jobSource.ts`'s `getSourceBadge()`, `components/shared/PlatformLogo.tsx` (real fetched Indeed logo)
Route: `components/shared/JobResultCard.tsx` (List view, own pill next to location), `components/missions/KanbanCard.tsx` (small pill alongside salary/Remote)
Last updated: 2026-08-18 (v2 — brand-colored, real logos, and a Missions filter added same day; v1 was plain-gray text-only). Renders a brand-colored pill ("via LinkedIn"/"via Indeed"/"Pasted") for `job.source` values `linkedin`/`indeed`/`url`; renders nothing for `SerpApi` (the default/majority case — not a distinguishing fact). LinkedIn uses `bg-linkedin-light text-linkedin` + the existing `LinkedInGlyph.tsx`; Indeed uses `bg-indeed-light text-indeed` + `PlatformLogo.tsx` (Indeed's real current favicon, fetched through `/api/logo` — see ui-tokens.md's "Source Badges" section for the `unavatar.io` 429 gotcha that shaped this). Filterable on `/missions` via `MissionsFilterBar.tsx`'s new "Source" popover (only shows options actually present in the loaded jobs, via `SOURCE_FILTER_OPTIONS`).

### Platform logo (real, fetched)

File: `components/shared/PlatformLogo.tsx`
Last updated: 2026-08-18. `"use client"`, takes a `source` key (currently only `"indeed"` registered) and fetches that platform's real current logo/favicon through `/api/logo`, falling back to rendering nothing (not a placeholder) on a failed load — same graceful-degradation shape as `CompanyLogo.tsx`. Add a new platform by adding its fixed logo URL to `PLATFORM_LOGO_URLS` and allowlisting the host in `app/api/logo/route.ts` if it isn't `unavatar.io`.

### Deadline tracker (job detail + Missions strip)

File: `components/job-details/JobDeadline.tsx` (set/edit/clear), `components/missions/UpcomingDeadlines.tsx` (upcoming strip)
Route: job detail page (`JobDeadline`, right after Tags & Notes), `/missions` (`UpcomingDeadlines`, above the Board/List toggle)
Last updated: 2026-08-18. `JobDeadline` — label `Input` + `type="datetime-local"` `Input`, `Save` disabled until changed, a `ghost` `X` `Button` to clear (only shown once a deadline exists). `UpcomingDeadlines` — server component, horizontal-scroll `w-64 flex-shrink-0` cards matching `RecentlyViewed`'s shape (see below), sorted ascending by `next_deadline_at`, overdue items shown in `text-warning` instead of `text-accent`, up to 8. Section header reuses the same `font-mono text-[11px] uppercase tracking-widest text-text-muted` treatment as "Active targets"/"Recently viewed".

### Recently Viewed (find-jobs strip)

File: `components/find-jobs/RecentlyViewed.tsx`
Route: `/find-jobs`, above the search form (`FindJobsForm`), below the page header
Last updated: 2026-08-18. Server component (not client) — up to 6 jobs by `jobs.last_viewed_at desc`, horizontal-scroll strip of `w-64 flex-shrink-0` cards (`CompanyLogo` size `sm`, title/company/`formatTimeAgo` label/match score), `overflow-x-auto` container. Written to by `app/find-jobs/[id]/page.tsx` on every job-detail page load via `after()` (`next/server`) — fire-and-forget, doesn't delay the page response. Section header uses the same `font-mono text-[11px] uppercase tracking-widest text-text-muted` treatment as "Active targets" elsewhere on this page.

### Application History (per-job event timeline)

File: `components/job-details/ApplicationHistory.tsx`, `actions/careerEvents.ts`'s `listJobEventHistory`
Route: job detail page (`/find-jobs/[id]`), outside the tabs, right after `JobInfo`
Last updated: 2026-08-18. Renders `application_events`/`interview_events`/`compensation_events` scoped to one job (previously only ever writable from this page, only ever readable on the global `/career` flat timeline). Colored-dot list matching `CareerTimeline.tsx`'s visual language; returns `null` when empty (no empty-state card).

### Tags & Notes (job detail)

File: `components/job-details/JobTagsAndNotes.tsx`, `actions/jobs.ts`'s `updateJobTags`/`updateJobNotes`
Route: job detail page, right after Application History
Last updated: 2026-08-18. Reuses `TagInput` from `components/ui/FormControls.tsx` verbatim. Notes save on blur, tags save on every add/remove. User's own tags also render as accent-colored chips on `JobResultCard` (distinct styling from the card's existing auto-derived fit-pills, which use a plain border style).

### Interview Debrief

File: `components/job-details/InterviewDebrief.tsx`
Route: job detail page's "Interview Prep Room" tab (only when `application_status === "interviewing"`), below `InterviewPanel`
Last updated: 2026-08-18. First real UI ever calling `logInterviewEvent` (existed since §Q1, unused until now). Outcome select + optional panelist select (only shown if panel members exist) + notes textarea; supports logging more than once per job (multiple interview rounds).

### STAR Vault (career-asset surfacing)

File: `components/career/StarVault.tsx`
Route: `/career`, between STAR-adjacent sections
Last updated: 2026-08-17/18. Reuses `StarStoryMatrix.tsx`'s `StarStoryEditor` verbatim (exported for this purpose) rather than forking the add/edit UI. New link/unlink control against `interview_events` via `linkStarStoryToInterview`.

### Brag Doc Generator

File: `components/career/BragDocGenerator.tsx`, `components/documents/BragDocPDF.tsx`, `lib/bragDoc.ts`
Route: `/career`
Last updated: 2026-08-17. Date-range picker + Generate button; result held client-side (not persisted server-side) until "Download PDF" posts it to `/api/career/brag-doc`. PDF reuses `ResumePDF.tsx`'s `resolveTokens`/`mapRange` infra, single fixed theme (no template picker).

### Résumé Suggestions Queue (always-warm résumé)

File: `components/career/ResumeSuggestionsQueue.tsx`, `lib/resumeSuggestions.ts`, `lib/inngest/functions.ts`'s `generateResumeSuggestionAsync`
Route: `/career`
Last updated: 2026-08-17. Background-generated bullet suggestions from newly-logged accomplishments (Inngest, triggered on `accomplishments/logged`). Visually mirrors `EditorTab.tsx`'s private `BulletDiffCard` Was/Now language (parallel implementation, not shared — that component isn't exported). "Accept" copies to clipboard rather than writing into a résumé, since there's no single deterministic base-résumé target.

### Sortie Browser Extension (Manifest V3)

File: top-level `extension/` directory (`manifest.json`, `content.js`, `background.js`, `popup.html`/`.js`/`.css`) — **not** part of this Next.js app, excluded from its ESLint config
Last updated: 2026-08-18 (v1.4). Inline Shadow-DOM widget (falls back to floating bottom-right if the site's Apply-button anchor selector doesn't match) with a live match-score badge (manual refresh button included) next to LinkedIn/Indeed job postings; context-aware popup; Greenhouse/Lever autofill adapters + fuzzy `<select>` matching + generic keyword-matching fallback. Full detail and known caveats in `extension/README.md` — read that before touching extension code, it documents 3 real bugs found and fixed live this session (CORS host_permissions gap, LinkedIn's hashed-CSS-class churn, a swallowed autofill error).

### Navigator (global AI copilot — floating-only)

File: `components/agent/NavigatorChat.tsx`, `components/agent/NavigatorLauncher.tsx`, `components/agent/NavigatorLauncherLoader.tsx`, `lib/agentAssistant.ts`, `actions/agent.ts`
Route: globally floating on every authenticated route (mounted in `app/layout.tsx`) — **no dedicated page**, see below
Last updated: 2026-08-17 (floating-only architecture + animation + full chat UI pass; originally shipped 2026-08-14, Phase 12)

**Pattern notes:**
**The dedicated `/agent` page was removed 2026-08-17, per direct user decision — Navigator is floating-only now.** Don't recreate it if a future request sounds like it wants one; confirm with the user first, since this was a deliberate reversal of the original page+launcher design. `NavigatorChat.tsx` is otherwise unchanged in shape — bubble styling copies `DocumentChatEditor.tsx`'s left/right-aligned convention, and an action-proposal reply (currently only `log_accomplishment`) still renders as an inline card matching `EditorTab.tsx`'s `BulletDiffCard` (agent-teal Accept/Discard, not `ConfirmDialog`'s red treatment — this is a suggestion to review, not something dangerous).

**Global floating launcher**: `NavigatorLauncherLoader.tsx` mounted in `app/layout.tsx` right after `SettingsModalLoader`, same `dynamic(..., { ssr: false })` wrapper — reuse this exact pattern for any future globally-mounted, root-layout-level interactive element. `NavigatorLauncher.tsx` itself gates on `usePathname()` against a small public-route allowlist (`/`, `/login`, `/waitlist`, `/preview/*`), since every Navigator action requires `requireUser()` and this app has no shared authenticated-layout to read real auth state from at the root (confirmed — every page composes its own `<Navbar isAuthenticated />`).

**Real bug fixed before shipping (2026-08-14) — list rendering.** A flat `<p>{content}</p>` collapses newlines, so a multi-item AI reply (e.g. "what can you do?") rendered as one dense paragraph instead of a scannable list — caught live via a side-by-side comparison against JobRight's Orion. Fixed with a `renderMessageContent()` helper in `NavigatorChat.tsx` that parses contiguous `- `/`• `-prefixed lines into a real `<ul className="list-disc pl-4">`, falling back to `whitespace-pre-line` prose for everything else — paired with an explicit system-prompt instruction (`lib/agentAssistant.ts`) to actually format multi-item replies that way in the first place. Any future AI-chat surface that might return lists should use this same parse-don't-trust-whitespace approach rather than a plain `<p>`, since no markdown-rendering library exists in this codebase and adding one wasn't warranted for this.

**Open/close animation (2026-08-17)** — `NavigatorLauncher.tsx` splits `open` (logical state) from `mounted` (DOM presence): closing sets `open=false` immediately (triggers the `animate-out fade-out-0 zoom-out-95 slide-out-to-bottom-4 duration-150` classes) but keeps the panel mounted for `EXIT_DURATION_MS` (150ms) via a cancellable `setTimeout` before actually unmounting — a hard conditional-render unmount has no exit animation to play. Enter is `animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-200` — exit is deliberately shorter (~68% of enter, Material Design's "exit faster than enter" guidance, sourced via the `ui-ux-pro-max` skill). FAB icon crossfades/rotates between Sparkles and X (`motion-reduce:transition-none` fallback) instead of an instant swap. Reuses this codebase's existing `tw-animate-css` utilities — no new animation library. Outside-click and Escape both close it; an explicit header X button was added too (previously the FAB was the only way to close).

**Real bug, caught live by the user's own manual testing, not review: the FAB "close" click appeared to do nothing.** Root cause — the outside-click `mousedown` listener excluded the panel (`panelRef`) but not the FAB itself, so clicking the FAB while open fired `mousedown` → read as an outside click → closed the panel — *before* the FAB's own `click` handler ran and, seeing the now-stale `open` value from its refreshed closure, reopened it. Two handlers racing each other on the same interaction. Fixed by adding a second `fabRef` to the same exclusion check. **This is a general trap for any future component combining "click the trigger to toggle" with "click outside to close": the trigger element MUST be excluded from the outside-click check, or a mousedown-then-click sequence on the trigger itself will fight its own toggle handler.** Verified via a real `mousedown`→`mouseup`→`click` event sequence dispatched through `javascript_tool` — a plain synthetic `.click()` call skips `mousedown` entirely and would NOT have caught this bug (confirmed empirically: the first verification pass used `.click()` and missed it).

**Chat UI pass (2026-08-17, "make whole chatting ai tool much better")**: auto-scroll-to-bottom on every new message/typing-tick (`scrollRef` + `scrollTo({behavior:"smooth"})` in a `useEffect` keyed on `[messages, isPending]`); `autoFocus` prop (floating launcher passes its own `open` state through) to focus the input when the popover opens; a real animated typing indicator (3 `animate-bounce` dots staggered via inline `animationDelay`, `motion-reduce:animate-none` fallback) replacing plain "Navigator is thinking..." text; small avatar circles both sides (Sparkles for Navigator matching the header icon, a plain lucide `User` icon for the human side — no profile-photo data is wired into this component, so a generic icon rather than fabricating one); each message wrapper carries `.fade-in-up` (this app's existing entrance-animation class, `app/globals.css`) — safe to apply unconditionally per-message since React keeps already-mounted keyed nodes stable, so it only ever plays once per newly-appended message, never replays on unrelated re-renders. **WhatsApp-style day separators + per-message timestamps**, per explicit user request — `formatDayLabel()`/`formatMessageTime()` local helpers (chat-specific grouping logic, deliberately not folded into `lib/utils.ts`'s shared `formatDate`/`formatTimeAgo`, which serve a different, more general need). Messages render via `Fragment`-wrapped `{separator}{bubble}` pairs so the day-separator pill can be conditionally inserted without breaking the `.map()`'s single-child-per-key contract.

### Interview Prep Room tab (job-detail page restructure)

File: `app/find-jobs/[id]/page.tsx` (new `interview-prep` tab entry, conditionally spliced into the `Tabs` array only when `application_status === "interviewing"`, set as `defaultTabId` in that case)
Last updated: 2026-08-14 (Phase 12 — new)

**Pattern notes:**
2-column "Command Center" layout researched via `agy`: `grid grid-cols-1 gap-6 md:grid-cols-[1fr_22rem] md:items-start`, main content (`QuestionBankPanel` + `InterrogationPlan`) at 65%-equivalent width, sidebar (`TrapDoorPredictor` + `InterviewPanel`) at a fixed 22rem. **Reading-order rule, learned the hard way**: CSS `order` utilities (`md:order-1`/`md:order-2`) only change *visual* layout order, never DOM/accessibility-tree order — a screen reader or any DOM-order-based extraction still encounters elements in literal JSX order. To get a real Risk → Context → Defense → Offense reading order for ALL users (not just sighted desktop ones), the sidebar div (Trap Door + Panel) must be written FIRST in JSX/DOM, with `md:order-2` only flipping it visually onto the right column on desktop; the main div goes second in DOM with `md:order-1`. On mobile (single column) this needs zero extra reordering since DOM order already matches the desired visual order. Get this backwards (order classes on divs in "visual" order instead of "DOM" order) and it'll still *look* right on desktop while reading wrong to every other consumer — verify with `get_page_text`/`read_page`, not just a screenshot, when building any risk-prioritized layout like this again.

### TrapDoorPredictor

File: `components/job-details/TrapDoorPredictor.tsx`, `lib/trapDoorPredictor.ts`
Route: `app/find-jobs/[id]/page.tsx`'s "Interview Prep Room" tab (sidebar)
Last updated: 2026-08-14 (Phase 12 — new)

**Pattern notes:**
Same opt-in button-triggered card shape as `StrategicMoatBriefing.tsx` (header + refresh/generate button + `border-l-2 border-error bg-error/10` confidence-note callout instead of the usual agent-teal one, since this is specifically risk content — category badges use `TRAP_DOOR_CATEGORY_LABELS`). The action (`getTrapDoorPredictions`, `actions/jobs.ts`) auto-chains `researchCompany` internally if `company_research` doesn't exist yet rather than blocking — see the "auto-chain prerequisites" note under InterrogationPlan below, same reasoning applies here.

### InterrogationPlan

File: `components/job-details/InterrogationPlan.tsx`, `lib/interrogationPlan.ts`
Route: `app/find-jobs/[id]/page.tsx`'s "Interview Prep Room" tab (main column)
Last updated: 2026-08-14 (Phase 12 — new)

**Pattern notes:**
Same opt-in card shape again, grouped output (`generalQuestions` list + one card per `perInterviewer` entry). **Auto-chain prerequisites, per explicit user direction (2026-08-14)**: the button is NEVER hard-disabled — earlier it was disabled + explained-with-copy when neither `strategic_moat` nor a researched panelist existed yet, but the user corrected this: "if it requires ... and there was no call, you can automatically call it unless it cost us." The action (`getInterrogationPlan`) now auto-runs `researchStrategicMoat` internally when `strategic_moat` is missing, persists it, then proceeds — justified because that call shares the same free-primary/paid-fallback cost profile already accepted elsewhere (Jina Reader first, Perplexity only if blocked). The click itself still stays manual — nothing auto-fires on mount. Apply this same "auto-chain the free-primary-path prerequisite, don't block the user with a redirect-elsewhere message" pattern to any future feature with a soft data dependency on another opt-in AI feature, as long as the dependency's cost profile is the same free-primary one — don't apply it to anything whose primary path is itself paid (e.g. Insider Connections).

### StarStoryMatrix

File: `components/interview/StarStoryMatrix.tsx`, `lib/starStoryMatcher.ts`, `actions/starStories.ts`
Route: `app/interview/page.tsx` (global page, below `QuestionBankPanel`)
Last updated: 2026-08-14 (Phase 12 — new)

**Pattern notes:**
Two independent halves in one card: a zero-AI CRUD story list (add/edit/delete via `SectionModal.tsx`, same glass-modal recipe as `AddAccomplishmentModal.tsx`) and an ephemeral on-demand matcher (company/role/seniority inputs, same look as `QuestionBankPanel`'s unlocked search form) that is NOT persisted to the DB — match results are a function of the user's current mutable story set, so they're returned straight to the client per-request rather than cached. `star_stories` is a new per-user-owned table (mirrors `accomplishments`' RLS/shape exactly), with an optional nullable `accomplishment_id` FK for provenance only (no AI auto-fill from an accomplishment into STAR fields in v1).

### QuestionBankPanel — Study View (deep per-question guidance)

File: `components/interview/QuestionBankPanel.tsx`, `lib/interviewQuestions.ts` (new `QuestionDetails` discriminated union + `generateQuestionDetails`), `actions/interviewQuestions.ts` (new `getQuestionDetails`)
Last updated: 2026-08-14 (Phase 12 — major update, per direct user request after seeing a JobRight per-question detail screenshot)

**Pattern notes:**
Question cards are now clickable (category-pill-filterable list, `presentCategories` computed from the actual bank), opening a right-side "Study View" panel — `fixed inset-0 z-50 flex justify-end` backdrop + `slide-in-from-right-8 animate-in` panel, same visual recipe as `ConfirmDialog.tsx`'s modal chrome adapted to a drawer shape. Content branches on `QuestionDetails.type`: `technical` gets Insider Tips + a numbered Approach + a code "AI reference implementation" (plain `<pre><code>`, no syntax-highlighter dependency added) with a copy button; `system_design` gets the same tips/approach but a prose "AI reference design walkthrough" instead of code; `behavioral`/`culture_fit` get Insider Tips + a STAR framework outline ("Structuring your answer — AI strategy guide") rather than a canned model answer. Every section is explicitly labeled AI-generated/reference/strategy-guide, never "verified," per `agy` research on honest labeling — always keep the "not a verified real answer key" disclaimer line if this pattern gets reused. Details generate lazily (only on first expand, one small Gemini call per question, addressed by array index not a new id column) and persist back into the same shared `interview_question_banks.questions` jsonb row, so every subsequent user who expands that exact question gets a free cache-hit read. **Real bug, caught live, fixed before shipping**: the panel is `position: fixed`, but it's mounted deep inside this page's `.fade-in-up`-animated Tabs tree — any ancestor with `animation-fill-mode: both` and a `transform` in its keyframes permanently establishes a new containing block, which silently breaks `fixed` positioning for descendants (confirmed via `getBoundingClientRect()` — the backdrop rendered at the ancestor's scroll offset, not the viewport). Fixed with `createPortal(..., document.body)`. **Any future `position: fixed` element mounted anywhere inside a `.fade-in-up`-wrapped tree needs the same portal treatment** — this bug class is very likely still present in any pre-existing modal nested the same way (e.g. `ConfirmDialog` usages on this exact page), not audited/fixed here.

### QuestionBankPanel (Cached AI Interview Question Bank)

File: components/interview/QuestionBankPanel.tsx, lib/interviewQuestions.ts, actions/interviewQuestions.ts
Route: app/interview/page.tsx (locked=false, editable search), app/find-jobs/[id]/page.tsx (locked=true, pre-filled embed, inside the "Interview Prep Room" tab as of Phase 12)
Last updated: 2026-08-13 (Phase 11 — new)

**Pattern notes:**
One component, two modes, matching the exact "same component, different props" recommendation from the `/interview` page-structure research (build-plan.md §N). `locked=false` shows editable Company/Role/Seniority text inputs + a "Get questions" button; `locked=true` hides the inputs and auto-fetches on mount, pre-filled from a job's own `company`/`title`/`seniority_level`. The AI-content disclosure uses the same "Agent read"-style callout as `InterviewPanel.tsx`'s researched-background block (`rounded-r-lg border-l-2 border-agent bg-agent-light`), but with copy specifically warning this is AI-*predicted*, not real leaked/sourced questions — never omit that framing if this pattern gets reused elsewhere. **Real lint bug from this component's auto-fetch effect**: calling `setState` synchronously before the first `await` inside a `useEffect`-triggered function trips `react-hooks/set-state-in-effect` — the fix is moving the ENTIRE function body, including any early-return validation, inside `startTransition()`, not just the async part. Same pattern `CompanyResearchAutoLoader.tsx` already uses for mount-triggered fetches; reach for that exact shape for any future auto-load-on-mount component instead of a plain `useState`-driven loading flag.

### FilterBar (Find & Evaluate filter bar)

File: components/find-jobs/FilterBar.tsx, lib/jobFilters.ts
Route: app/find-jobs/page.tsx (via components/find-jobs/FindJobsForm.tsx)
Last updated: 2026-08-13 (Phase 11 — new, replaces 2 loose free-text filter boxes)

**Pattern notes:**
Researched via `agy` against LinkedIn/Indeed/Wellfound/Otta/JobRight/Teal/Glassdoor/ZipRecruiter: the industry-standard shape is a horizontal row of dropdown-trigger pills below the search inputs, each becoming a highlighted chip with an inline "✕" once applied. `FilterPopover`/`FilterPanel` reuse the exact same portal + `position:fixed` recipe as `StyleTab.tsx`'s `Dropdown`/`DropdownPanel` (see that entry below) — computed from the trigger's own `getBoundingClientRect()`, closes on outside-mousedown and on any ancestor scroll (`capture:true`). **Real bug from this exact pattern, caught live**: the "More filters" panel (holding Min Match Score/Visa Sponsorship/Hide Keyword/Company) originally had its own *separate* outside-click listener checking the trigger's wrapper `<div>` instead of the portaled panel content — since the panel renders outside that div in the DOM, every click inside it (a button, a text input) read as "outside" and closed the panel before the interaction registered. Fixed by deleting the duplicate listener and relying on `FilterPanel`'s own already-correct one (same fix `onClose` prop already gets everywhere else). 9 filters total: Date Posted (`RadioOption`, single-select, the only one that costs a real SerpApi call — goes to `lib/jobScraper.ts`'s `chips` query param, debounced 700ms via a `useEffect` in `FindJobsForm.tsx` so settling on a value only fires once), Remote Policy/Job Type/Experience Level (`CheckboxOption`, multi-select), Min Salary/Min Match Score (`RadioOption`, preset buckets), Visa Sponsorship (a real on/off `role="switch"` toggle — needs an explicit `left-0.5` base position on the knob `<span>`, not just `translate-x`, or it reads as "just changes color" with no visible slide), Hide Keyword/Company (plain text inputs). Filter state syncs to the URL (`?remote=...&jobType=...`) via `lib/jobFilters.ts`'s `filtersToSearchParams`/`searchParamsToFilters`, matching every competitor's "shareable filtered search" convention. `applyClientFilters` is a pure function (jobs in, filtered jobs out) — everything except Date Posted filters already-fetched/scored jobs for free (`detected_extensions`, `jobs.seniority_level`, `match_score`, description text all already extracted at zero marginal AI cost).

### ResumeSlotWorkspace (new, 2026-08-13 Phase 11 — uploaded-résumé editing parity)

File: `components/documents/ResumeSlotWorkspace.tsx`

Résumé-slot counterpart to `ResumeWorkspace.tsx` (tailored per-job résumés) — same overall shell (`rounded-2xl border border-border bg-surface shadow-card`, 2-column grid `lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]`, right-side tab strip) but scoped to a résumé slot id instead of a job id. Tabs are **Insights / Editor / Style** (not AI Rewrite/Editor/Style — "Insights" holds `ATSAuditCard` + `QualityGradeCard`, no job-specific fit-score gauge or chat editor, since there's no job to revise against). `EditorTab.tsx` was refactored to accept an injected `onRewriteBullet` prop instead of a hardcoded `jobId`, so it serves both workspaces without duplicated UI.

Preview pane has 2 states, not 1: before any edit is saved (`resumes.sections` still `null`), it shows the real originally-uploaded PDF via an iframe (`/api/resumes/[id]/download`, no query param) with an explanatory `bg-agent-light` banner — never silently substitutes the AI-reconstructed version for the real file. Once an edit is saved, the pane gets a pill toggle (`Live edit` / `Original upload`, same `rounded-full border border-border bg-surface p-1` chrome as `Tabs.tsx`) so the original stays reachable in-place — deliberately not a `target="_blank"` link (a first version used one, changed after direct user feedback that it should stay in the same view). `?original=1` on the download route always serves the raw upload regardless of edit state.

### ATSAuditCard changes (2026-08-13 Phase 11)

File: `components/documents/ATSAuditCard.tsx`. Two real bugs fixed, both apply to tailored résumés too since it's a shared component:
1. New `noKeywordDataHint?: string` prop (context-specific copy — tailored résumés point at the fit-score button above, résumé slots explain there's no job to check against). When `matchedKeywords.length + missingKeywords.length === 0`, the displayed score/tone now come from `formatting.score * 2` (scaled to /100) instead of the combined `overallScore`, which silently caps at 50 with no keyword data — was making a perfectly clean résumé read as "High risk."
2. Zero-formatting-issues case now renders an explicit confirmation message (`border-agent bg-agent/5` block, "No formatting issues found…") instead of just a bare `ShieldCheck` icon with no text.
3. New manual "Recheck" button (`RefreshCw`, top-right next to the issue-count/ShieldCheck) — the card already recomputes live via `useMemo` on every real edit, so this is a genuine forced-recompute (via a `recheckKey` dependency) for visual parity with `QualityGradeCard`'s refresh button, not a fix for actual staleness.

### CoverLetterATSAuditCard (cover letter ATS Compatibility Score)

File: components/documents/CoverLetterATSAuditCard.tsx, lib/atsChecker.ts (`analyzeCoverLetterATS`)
Route: components/documents/CoverLetterWorkspace.tsx — Editor tab, above the Salutation field
Last updated: 2026-08-12

**Pattern notes:**
Same visual recipe as `ATSAuditCard.tsx` below (score badge + `border-l-2` issue cards), but fully deterministic — no keyword-match half, since cover letters have no `scoreJump`-equivalent fit-score infrastructure to reuse, and adding a new AI call just for this would break the "reuse what's already computed, don't spend new AI budget" principle the résumé version established. 4 checks: word count (200-400 sweet spot), company-name mention in the letter body, generic-salutation phrase match, and the same multi-column `"split"`-template risk — confirmed real for cover letters too by reading `CoverLetterPDF.tsx` (it renders a genuine contact/skills sidebar for that template; `"executive"` does NOT trigger this for letters, unlike for résumés, so the check is template-specific, not reusing `MULTI_COLUMN_TEMPLATES` wholesale). Returns an early "write your letter to see a score" empty state when `letterBody` is blank, rather than showing a 0 score against nothing.

### ATSAuditCard (résumé ATS Compatibility Score)

File: components/documents/ATSAuditCard.tsx, lib/atsChecker.ts
Route: components/documents/AIRewriteTab.tsx — inside `ResumeWorkspace`'s AI Rewrite tab, between the fit-score gauge and `QualityGradeCard`
Last updated: 2026-08-12

**Pattern notes:**
Same `rounded-xl border border-border bg-surface-secondary p-4` card recipe as `QualityGradeCard.tsx` — a colored score badge (`bg-agent`/`bg-warning/15`/`bg-error/10` at 80/60 thresholds) plus a stacked issue list. Deliberately zero-cost and always-live (`useMemo` on `style`/`sections`/`contact`/keyword props, no button, no usage cap, no DB persistence) rather than a usage-gated AI action like `QualityGradeCard` — see `lib/atsChecker.ts`'s header comment for why: the formatting half is pure computation on data the workspace already has, and the keyword half reuses `scoreJump.matchedKeywords`/`missingKeywords` instead of a second AI call re-deriving the same thing. Issues render as `border-l-2` callout cards (`border-error`/`border-warning` by severity) — NOT the "Agent read" agent-teal treatment from ui-rules.md's Agent Content section, since none of this is AI output (same precedent as `OfferWorkspace`'s two calculators below). `AIRewriteTab`/`ResumeWorkspace` had to grow 3 new props (`style`, `sections`, `contact`) to feed this — `contact` is `{email,phone,location}` lifted from `profile` in `ResumeWorkspace`, not fetched separately.

### OfferWorkspace + EquityDecoder + TakeHomeEstimator ("Offer Tools" tabbed calculator page tab)

File: components/job-details/OfferWorkspace.tsx, EquityDecoder.tsx, TakeHomeEstimator.tsx
Route: app/find-jobs/[id]/page.tsx — its own top-level page tab ("Offer Tools", alongside Overview/Company), **always visible regardless of `application_status`** (un-gated 2026-08-12 per explicit user request — was originally gated on `offered` only, at launch)
Last updated: 2026-08-12

**Pattern notes:**
Two pure-calculator features (Equity & Cap Table Decoder, Salary Tax & Take-Home Calculator) share ONE card via `Tabs.tsx` — same tab-switcher already used for the page's own Overview/Company split — rather than stacking as separate cards, per explicit user request. `OfferWorkspace` owns the outer `border border-border bg-surface shadow-card rounded-2xl p-6` card, no header of its own since it's the entire content of its own top-level page tab (that tab's label already says "Offer Tools" — an inner header would be redundant); each of its two inner tabs' content component ALSO has no outer section/header — just the description text + Save button row directly. Both are 100% user-entered-number calculators (no AI call), so they deliberately do NOT get the "Agent read" agent-teal treatment — ordinary `bg-surface-secondary` stat grid for computed results (`Stat` sub-component, `font-mono font-semibold tabular-nums`, red-ish `text-warning` only for a genuine warning value like an underwater ISO spread). Each tab persists to its own DB column (`jobs.offer_details` / `jobs.tax_estimate_inputs`) via its own server action so the two tabs' saves can never clobber each other. The Tax Calculator's default income prefill reads the Equity Decoder's last-*saved* total comp (computed server-side on the page, not live client state lifted across tabs).

### LeverageSynthesizer (Post-Offer Leverage Synthesizer)

File: components/job-details/LeverageSynthesizer.tsx
Route: app/find-jobs/[id]/page.tsx (gated on `application_status === "offered"`, sits below `OfferWorkspace`)
Last updated: 2026-08-12

**Pattern notes:**
Same opt-in button-triggered shape as `StrategicMoatBriefing.tsx`/`InterviewPanel.tsx` — own outer card (unlike the two calculators above, since this IS AI output). AI result gets the exact "Agent read" treatment from ui-rules.md's Agent Content section (`border-l-2 border-agent`, `bg-agent-light`, `text-agent-dark`, `rounded-r-lg`) — a leverage-level pill (`strong`→success, `moderate`→agent-teal, `limited`→warning, `unclear`→neutral) sits in the card header, then grounded factors, then a "Talking points" sub-list, then an italicized confidence-note line, mirroring `RejectionDiagnosis`'s card shape in `KanbanCard.tsx` almost exactly.

### MissionsView + KanbanBoard/KanbanCard/KanbanBoardLoader (application tracker — renamed from "Pipeline" 2026-08-12)

File: components/missions/MissionsView.tsx, KanbanBoard.tsx, KanbanCard.tsx, KanbanBoardLoader.tsx, MissionsFilterBar.tsx
Route: app/missions/page.tsx
Last updated: 2026-08-17 (extended filter bar + real Kanban card details, agy-researched; everything below the new section unchanged since 2026-08-12/the location filter bar's own 2026-08-17 addition)

**Pattern notes:**
`MissionsView` is the page-level wrapper: a Board/List toggle (`inline-flex ... rounded-full border border-border bg-surface p-1`, active tab `bg-accent text-accent-foreground`) plus, in List mode, `STAGE_ORDER`-driven filter pills (`lib/applicationStatus.ts`). Board mode renders the existing `KanbanBoardLoader` unchanged; List mode reuses `JobResultCard` directly — same component Liked/External/Recommended already use, so a new list view never needs new card markup. `KanbanBoardLoader` MUST stay `next/dynamic(..., {ssr:false})` — `@dnd-kit`'s `DndContext` generates an instance-counter `aria-describedby` id that mismatches between SSR and client hydration otherwise (confirmed live, an explicit `id` prop does not fix it). `KanbanCard`'s drag handle is a small dedicated `GripVertical` button carrying `{...attributes}{...listeners}`, never the whole card — spreading `useSortable`'s `attributes` (which sets `role="button"`) onto a card containing real `<button>`/`<Link>` children produces invalid nested-button HTML whose inner clicks silently never fire (confirmed live, same failure mode `EditorTab.tsx`'s own comment already warns about).

**Location/search/remote filter bar (2026-08-17, `MissionsFilterBar.tsx`), per direct user request** ("user can look for different jobs at different location"). Mirrors `FilterBar.tsx`'s (Find & Evaluate) `FilterPopover`/`FilterPanel`/`RadioOption` portal pattern as its own small local copy — not a shared import, since this is plain client-side array filtering over already-loaded `jobs`, a different data model from `FilterBar`'s server-driven `SearchFilters`/query-param shape. Search matches title/company substring; Location is single-select, built from the unique `job.location` values actually present in the user's own tracked jobs (not a hardcoded list); Remote reuses the `/\bremote\b/i` title+location regex idiom already established on the job-details page/`JobActionBar`. Applies to both Board and List views — unlike the pre-existing stage pills above, which stay List-only since Kanban already groups by stage as its own columns. `KanbanCard` also gained a small `MapPin` + location line so the board itself surfaces what's now filterable.

**Filter-change-doesn't-affect-Kanban gotcha, fixed in the same pass**: `KanbanBoard.tsx` seeds its drag-state via `useState(() => groupByStatus(jobs))` — a lazy initializer that runs ONLY ONCE (deliberate: a completed drag's optimistic column move must survive the next server-revalidated `jobs` prop without getting clobbered). That same laziness means it never re-derives columns if `jobs` changes shape after mount — so filtering `jobs` in the parent and passing a smaller array down would silently do nothing to the Kanban view. Fixed by keying `KanbanBoardLoader` on the active filter combo (`key={\`${search}|${location}|${remoteOnly}\`}`), forcing a full remount (and fresh `groupByStatus` call) on any filter change. **Any future consumer of `KanbanBoard` that wants to change its `jobs` prop after mount needs this same key-to-force-remount treatment** — passing a new array alone is not sufficient.

**Two more real bugs, caught live by the user immediately after shipping the filter bar, both fixed same-session:**
- **Internal-scroll-closes-the-popover.** `MissionsFilterBar.tsx`'s `FilterPanel` is the first `FilterPanel`-shaped popover in the codebase to actually need `overflow-y-auto` internal scrolling (an arbitrarily-long location list) — `FilterBar.tsx`'s own copy of the "close on page scroll" listener (`window.addEventListener("scroll", onClose, true)`, capture phase) never hit this because none of ITS panels overflow. A capture-phase `window` scroll listener receives scroll events from any descendant scrollable element even though `scroll` doesn't bubble in the normal phase — so scrolling the internal list read as "the page scrolled" and closed the panel immediately. **General rule for any future `FilterPanel`-style popover that adds internal scrolling: the scroll-close handler MUST check `event.target` against the panel's own ref and ignore internal scrolls** — copying the plain `onClose` listener without that guard silently breaks scrolling the moment the panel's content can overflow. Also guard `event.target instanceof Node` before calling `.contains()` on it — a scroll event's target isn't always a proper Node, and `Node.contains()` throws (not returns false) on a non-Node argument.
- **Near-duplicate location entries.** Google Jobs' raw scraped location text sometimes carries a `"(+N other/others)"` multi-location suffix (e.g. `"Toronto, ON (+1 other)"`) — same city, different literal string than a plain `"Toronto, ON"` posting, so they showed as separate filter options. `MissionsView.tsx`'s `normalizeLocationForFilter()` strips the suffix before both building the dropdown's unique list and matching the filter — any future location-based grouping/filtering elsewhere in the app should reuse or mirror this same normalization, not assume `job.location` is already a clean city string.

**Extended filter bar + real Kanban card details (2026-08-17), agy-researched — the fuller round beyond the location filter above.**

- **New filter controls** (`MissionsFilterBar.tsx`): min match-score threshold (50/70/85, `FilterPopover` + `RadioOption`, mirrors `FilterBar.tsx`'s own salary-threshold shape), a "Needs attention" pill (reuses `lib/jobStatus.ts`'s existing `getListingSignal` — no new staleness logic), and a `Sort` popover (`SortValue`: `found` default / `match` / `stage`, where `stage` sorts oldest-status-change-first so quietest jobs surface first). `FilterPopover`'s icon was generalized from a hardcoded `MapPin` to an `icon: React.ReactNode` prop so it could be reused across Location/Min-match/Sort without duplicating the whole component.
- **New `KanbanCard` details, each gated on whether real data actually exists for it (never a placeholder/fabricated value)**: a `Star` priority toggle (`jobs.is_priority`, new column, `toggleJobPriority` action mirrors `toggleSaveJob`/`toggleHideJob` exactly); a salary badge (`job.salary` — already-existing column, was fetched but never rendered on this card before); a `Remote` badge (same `/\bremote\b/i` regex idiom as the location line above); an "Applied {relative time}" line sourced from `application_events` (§Q1) filtered to `event_type='applied'`, distinct from the pre-existing `stageAgeLabel` (that's time in the CURRENT stage only — total time since the ORIGINAL application is a genuinely different, longer number once a job has moved past "Applied").
- **Deliberately NOT built despite research ranking it #1**: an "upcoming interview date/time" card element. `interview_events.event_date` (§Q1) is stamped at LOG time (when the user marked the transition), not a real scheduled-future calendar time — showing it as "your interview is on X" would misrepresent a past logging timestamp as a forward deadline. Revisit only once there's an actual scheduling input backing it, not from this table alone.
- **`appliedAt` threading**: a plain `Record<jobId, isoDate>` prop, computed once in `app/missions/page.tsx` from a single batched `application_events` query, threaded unmerged through `MissionsView` → `KanbanBoardLoader` → `KanbanBoard` → `KanbanColumn` → `KanbanCard`. Deliberately NOT merged into the `Job`/`KanbanJob` type (it comes from a different table) — any future per-job data sourced from a table other than `jobs` should follow this same plain-lookup-map-as-a-separate-prop pattern rather than trying to extend `KanbanJob`'s `Pick<Job, ...>` shape with a field `Job` doesn't actually have.

### MissionsListRow + InboxTable rail redesign (Missions List/Inbox onto the Signal mockup)

File: components/missions/MissionsListRow.tsx (new), components/missions/InboxTable.tsx (rewritten), components/missions/MissionsView.tsx
Route: app/missions/page.tsx
Last updated: 2026-08-27 (Phase 28)

**Pattern notes:**
List view previously reused `JobResultCard` directly (see that entry above) — a real gap: a job-search-oriented row (Save/Apply/More-options, salary/seniority meta) with no visible pipeline stage, on a page whose entire point is tracking pipeline stage. Flagged in `RESUME.md` as a likely "built before the mockup's Missions section was fully read" case, same class of issue already known on job-detail. Fixed by giving List its own `MissionsListRow` built onto `.signal-rail`/`.signal-track`/`.signal-dot` (`app/globals.css` — the mockup's own `.rail`/`.track`, already proven on `CareerTimeline.tsx`'s timeline view and `AIActionCenter.tsx`), leading with the real pipeline status badge (`STATUS_CLASSES`/`STATUS_LABELS` from `lib/applicationStatus.ts` — the exact source the mockup's own badge colors were pulled from, per that file's own header comment) instead of triage actions, which stay one click away via the row's own link to job-detail. "Interviewing" gets `.signal-track-warm` (the rail's existing amber-pulse treatment for the one real "in motion" stage) — matches the mockup's own `.track.warm` row. Bulk multi-select (checkbox, `selectable`/`selected`/`onToggleSelect`) carried over unchanged from the old `JobResultCard` wiring in `MissionsView.tsx`.

`InboxTable.tsx` was a plain `<table>` — never appeared anywhere in the approved mockup, which uses the same `.rail`/`.track` primitive for its Inbox view too. Rewritten onto `.signal-rail`/`.signal-track` for visual consistency with List, but **deliberately keeps the checkbox multi-select + bulk Shortlist/Archive/Tag action bar + per-row Shortlist/Archive buttons** that the static mockup never had to demo — those are real, directly-requested functionality (Phase 22), not something to drop just because a static preview shows a simpler row. A `signal-dot` per row plus `.signal-track-warm` when `getListingSignal()` returns a real signal (stale/reappeared) — same semantic the dot already carries elsewhere on this rail primitive. **Same-session follow-up, direct user question**: this rewrite also closed a real, previously-flagged-but-unfixed gap — `InboxTable.tsx` never had the LinkedIn/Indeed source badge (`getSourceBadge`/`LinkedInGlyph`/`PlatformLogo`) that `JobResultCard`/`KanbanCard`/`MissionsListRow` all carry. Added to the row's meta line, same conditional render as those three.

**Honest verification-tier note, same category as Phase 24's**: this session's browser tab reported `document.hidden === true` throughout (a tooling-side issue — the Browser pane wasn't displayed to the user this session — not an app bug), which blocked click-driven view-mode switching (React state updates never visibly flushed) and screenshot compositing. List view was still live-verified with real account data via the `?stage=<status>` URL param (`MissionsView.tsx` seeds `viewMode="list"` from it), read through the accessibility tree (`read_page`, which works independent of paint/compositing) — confirmed a real Amazon job rendering title/company/`Shortlisted` badge/listing-signal/score state correctly. **Update, same session**: the `document.hidden` issue cleared on its own (same self-clearing behavior Phase 24 documented) — Inbox, List, and Board were all subsequently screenshot-verified live with real data (188-job Inbox, `Select all`, per-row Shortlist/Archive, the `.signal-track-warm` amber dot on an Interviewing row).

### Bulk multi-select — Kanban + Saved Jobs (general multi-select, build-plan.md §H)

File: components/missions/KanbanCard.tsx, KanbanBoard.tsx, KanbanBoardLoader.tsx, MissionsView.tsx, components/shared/SavedJobsTabs.tsx
Route: app/missions/page.tsx, app/saved-jobs/page.tsx
Last updated: 2026-08-27 (Phase 28, cont'd)

**Pattern notes:**
Closed the last real gap in `build-plan.md`'s §H bulk-actions row — `InboxTable.tsx`'s Shortlist/Archive (Phase 22) and Missions List's own select mode were the only bulk-select surfaces; Kanban and Saved Jobs had none. Both reuse the exact same select-mode/bulk-bar UI shape and the exact same generic `bulkHideJobs`/`bulkAddTag` actions (`actions/jobs.ts`, scoped only by `user_id`) already proven on List/Inbox — no new state shape, no new actions.

`KanbanCard.tsx`'s `selectable` prop **replaces** the drag handle with a checkbox rather than showing both — `useSortable({ disabled: selectable })` backs this structurally (not just visually) so a card can never be both draggable and multi-select-clickable at once, avoiding a genuinely ambiguous interaction rather than just decluttering it. `useDroppable({ disabled: selectMode })` on each column does the same for drop targets. Props thread `KanbanCard` → `KanbanColumn` → `KanbanBoard` → `KanbanBoardLoader` → `MissionsView.tsx`, which now shows its pre-existing Select-toggle-and-bulk-bar (previously gated to `viewMode === "list"` only) on both List and Board.

`SavedJobsTabs.tsx` reuses `JobResultCard`'s `selectable`/`selected`/`onToggleSelect` props — these already existed on that component (built for Missions List, see the `JobResultCard` entry above) but were never passed from this call site until now. No bulk-shortlist action here (that's Inbox-only, gated to `application_status = 'inbox'` rows), only Archive/Tag.

Live-verified end to end: saved a real job, exercised the Saved Jobs select UI, reverted the save; confirmed Kanban's checkbox-for-grip-handle swap and bulk bar with a real selection. `tsc --noEmit`/`eslint` clean.

### PostHog `application_status_changed` event + status-change action pattern

File: actions/jobs.ts (`setApplicationStatus`)
Last updated: 2026-08-11

**Pattern notes:**
Reversible status transition, follows `toggleSaveJob`'s shape (not the old one-way `markApplied`, deleted). Signature `setApplicationStatus(jobId, from, to)` — `from` comes from the caller's already-known client state (same idiom `JobActionBar` already used for optimistic local state), not a server-side fetch-before-write. Every call site (Kanban drag, `JobActionBar`'s status dropdown, `JobResultCard`'s "Already Applied" menu item) follows the same optimistic-`setState`-then-`startTransition`-with-rollback idiom already established for `toggleSaveJob`/`toggleHideJob`.

### JobActionBar status dropdown (portal/fixed-position pattern)

File: components/job-details/JobActionBar.tsx (`StatusMenuPanel`)
Last updated: 2026-08-12

**Pattern notes:**
**Read this before adding any dropdown menu on a page that has more content below the trigger.** A plain `position: absolute` child (the pattern `JobResultCard.tsx`'s "..." menu uses successfully) only works when the trigger sits at the bottom of its list/card with nothing below it. On this page, `JobActionBar` is followed by more cards (`JobInfo`, tabs, etc.) — a same-stacking-context absolute child painted *underneath* that later content instead of over it (confirmed live, a real bug). Fixed with the exact pattern already proven in `StyleTab.tsx`'s Theme/Page-size dropdowns: `createPortal` to `document.body`, `style={{position:"fixed", top, left}}` computed from the trigger's `getBoundingClientRect()` on click, close on `mousedown` outside AND on `window` scroll (`capture:true` — a fixed panel doesn't track its trigger if an ancestor scrolls). Reuse `StatusMenuPanel`'s shape, not a plain absolute div, for any future dropdown on a job-details-page-style layout.

### JobActionBar "log outcome" note prompt (`NotePromptPanel`)

File: components/job-details/JobActionBar.tsx (`NotePromptPanel`)
Last updated: 2026-08-17 (new — §Q1)

**Pattern notes:**
Renders in `StatusMenuPanel`'s place once a status with a real `application_events` counterpart is picked (`applied`/`interviewing`/`offered`/`rejected` — not `draft`, which has no event type since it's a correction, not an outcome). Same portal/`position:fixed` recipe as `StatusMenuPanel` (see above) — reuse that pattern, don't reinvent. One optional textarea + Skip/Log note buttons; "Log note" stays disabled until the textarea has trimmed content. **Dismissing without an explicit choice (click-away) still commits the status change with no note** — the status transition itself was never optional, only the note is, so `onClose` calls the same commit path as `onSkip` rather than aborting the pending change. Wired from `actions/jobs.ts`'s `setApplicationStatus(jobId, from, to, note?)`, which best-effort-inserts the matching `application_events` row in the same call.

### Interview Panel (`InterviewPanel.tsx`)

File: components/job-details/InterviewPanel.tsx
Last updated: 2026-08-12

**Pattern notes:**
Gated to render only when `job.application_status === "interviewing"` (same idiom `DocumentGenerator.tsx` already used for its draft-only warning banner). Add-panelist form is a plain inline two-input row (name + optional title), not a modal — this is a quick add, not a multi-field form. Per-panelist "Research background" result renders in the exact Agent Content teal-callout markup (`border-agent bg-agent-light`, "Agent read" label) — this is AI-generated content, must use this treatment per `ui-rules.md`, no exceptions for a "smaller" card.

### Strategic Moat Briefing (`StrategicMoatBriefing.tsx`)

File: components/job-details/StrategicMoatBriefing.tsx
Last updated: 2026-08-12

**Pattern notes:**
Same empty-state-button-then-dossier shape as `CompanyResearch.tsx`, living in the Company tab next to it. Opt-in button-triggered (not an auto-loader like `CompanyResearchAutoLoader.tsx`) since this one has a real, if usually free, cost path — matches the opt-in convention already used for Insider Connections/other paid-adjacent features.

### Career Timeline (epoch-nested) + Add Accomplishment Modal + Quick Add Bar

File: components/career/CareerTimeline.tsx, AddAccomplishmentModal.tsx, lib/careerTimeline.ts
Route: app/career/page.tsx
Last updated: 2026-08-17 (§Q1 — added the Career view/Full timeline toggle; epoch-nesting structure below unchanged since 2026-08-13, Phase 11)

**Pattern notes:**
Replaces the old flat dotted-list timeline (2026-08-11) after research (build-plan.md §E) found a flat equal-weight stream is the wrong shape for career data. `lib/careerTimeline.ts`'s `buildCareerEpochs` groups each `accomplishments` row under the work-experience role whose `[start_date, is_current ? today : end_date]` range contains the accomplishment's own `date` — auto-computed by date containment, deliberately no manual role picker (ambiguous overlaps resolve to the more recent role, checked in reverse-chronological order). An accomplishment whose date falls outside every role's range lands in a separate "Unassigned" section rather than being silently dropped or mis-bucketed. Education stays a flat list (no start/end range to test containment against, just a `graduation_year`) and job-search activity (tracker status changes) stays its own flat section — only work-experience roles get nested accomplishments. `EpochCard` (one per role, collapsible, `ChevronDown` rotate) reuses the same accent-dot item rendering the old flat list had, still user-authored-not-AI accent color per `ui-rules.md`'s Agent Content rule. New `QuickAddBar` — a single text input + Enter/send button, no modal — closes the page's old "no way to add anything from itself" gap flagged in the same research; always dates to today, which naturally nests it under whichever role is `is_current` via the same containment logic every other accomplishment uses. `AddAccomplishmentModal` gained an optional `defaultDate` prop so an epoch's own "Log here" button pre-fills a date inside that specific role's range (current role → today, past role → its end date) so the save naturally re-nests there without needing an explicit role field. Live-verified with real seeded test data (InsForge CLI raw SQL), not just `tsc`/`eslint`.

**§Q1 addition (2026-08-17): "Career view" / "Full timeline" toggle.** Epoch view (above) stays the default. `lib/careerTimeline.ts`'s new `buildFlatTimeline` merges accomplishments + education + real `application_events` rows (with their optional notes) into one reverse-chronological `TimelineEntry[]`, computed server-side in `app/career/page.tsx` and passed as a prop — `CareerTimeline` itself just toggles which pre-built view to render, no client-side recomputation. Distinct dot color per entry kind (`bg-accent` accomplishment / `bg-info` education / `bg-agent` application event) reuses the plain-solid-dot convention already established for the epoch view's own list items — not the light/dark badge-pair tokens. This is the one place the real per-event application history (every logged status transition, not just the current one) is actually visible in the UI.

### OutcomeInsights (§Q3 Application → Outcome Loop)

File: components/career/OutcomeInsights.tsx, lib/outcomeInsights.ts, lib/outcomeNarrative.ts, actions/outcomeInsights.ts
Route: app/career/page.tsx (renders above CareerTimeline)
Last updated: 2026-08-17 (new)

**Pattern notes:**
Two deterministic rate-bar groups (interview rate by match-score band, interview rate by evaluation grade — plain `<div>` width-percentage bars, no charting library, matching `MatchScore.tsx`'s existing bar-fill pattern) plus a rejection-reason count list, always computed server-side on page load (`getOutcomeStats()`, zero AI, no usage cap — two DB reads + pure math). Every individual stat is gated on `MIN_SAMPLE_SIZE = 3` (`lib/outcomeInsights.ts`) — a band/grade with only 1-2 data points is silently omitted rather than shown as a misleadingly crisp percentage; the whole section falls back to an honest "track a few more applications" empty state below that threshold. **Interview-reached status is read from `application_events` (§Q1), never from `jobs.application_status` alone** — a job's current status is lossy (a job now "rejected" may well have genuinely interviewed first), only the real per-event log knows that reliably.

**Optional AI narrative** (`lib/outcomeNarrative.ts`, `generateOutcomeNarrativeAction`) — opt-in button click only (never eager), same honesty-scoped shape as `rejectionIntelligence.ts`/`leverageSynthesizer.ts`: the model only ever sees the already-computed aggregate numbers, never raw job data or an outside benchmark, and every observation must cite a real number from the input. Renders in the standard `border-agent bg-agent-light` "AI Navigator reads" treatment once generated. New `outcome_narrative` usage key (5/day, `lib/usage.ts`).

**Deliberately deferred from the full §Q3 spec**: a `job_decisions` table for explicitly capturing "applied vs. skipped, and why" on jobs looked at but never acted on. Needs a new skip-reason capture UI that risks overlapping/confusing with the already-existing `is_hidden` "not interested" toggle — a real fast-follow, not built this pass.

### StarVault + BragDocGenerator + ResumeSuggestionsQueue (§Q4 Always-Warm Résumé + STAR Vault + Brag Doc)

File: `components/career/StarVault.tsx`, `components/career/BragDocGenerator.tsx`, `components/documents/BragDocPDF.tsx`, `components/career/ResumeSuggestionsQueue.tsx`, `lib/bragDoc.ts`, `lib/resumeSuggestions.ts`, `actions/bragDoc.ts`, `actions/resumeSuggestions.ts`, `app/api/career/brag-doc/route.ts`
Route: `app/career/page.tsx` (renders `ResumeSuggestionsQueue` → `OutcomeInsights` → `StarVault` → `BragDocGenerator` → `CareerTimeline`, in that order)
Last updated: 2026-08-17 (new)

**Pattern notes:**
**StarVault** — reuses `star_stories`' existing full CRUD (`actions/starStories.ts`, originally built for the STAR Story Matrix on `/interview`) rather than a new table; resurfaces the same rows on `/career` as a standalone Career Asset, independent of that page's job-matching flow. Reuses `StarStoryMatrix.tsx`'s private `StarStoryEditor` verbatim (newly exported) for add/edit — zero new editing pattern. New: a "link this story to the interview it was used for" control (`interview_event_id` nullable FK, applied via `db query` directly since it references `public.interview_events`, not `auth.users`) — a plain `<select>` when unlinked, a `Link2`/`Unlink` badge row when linked, matching this codebase's small-inline-control convention rather than a modal.

**BragDocGenerator + BragDocPDF** — a date-range-scoped self-review draft (`lib/bragDoc.ts`, one Gemini call over `accomplishments`+`compensation_events`, same honesty-scoped/grounded-only shape as `rejectionIntelligence.ts`/`leverageSynthesizer.ts`, XYZ-formula bullets via the existing `writingStyle.ts` rules). Result renders in the standard `border-agent bg-agent-light` "AI Navigator reads" card for the summary, plain `border-border bg-surface-secondary` cards for each highlight (not agent-teal — these are direct restatements of the user's own accomplishments, not synthesized commentary). Not persisted server-side — `BragDocPDF.tsx` reuses `ResumePDF.tsx`'s own `resolveTokens`/`mapRange`/`SPACING_RANGES` exports (a fixed single "modern" layout, no template/theme picker — this is an internal draft, not a per-employer document) and `/api/career/brag-doc` (POST, zod-validated body) renders on demand from whatever the client already holds in state. New `brag_doc` usage key (5/day, `lib/usage.ts`).

**ResumeSuggestionsQueue** — review queue for `resume_update_suggestions`, a background-generated bullet-suggestion table populated by a new Inngest function (`lib/inngest/functions.ts`'s `generateResumeSuggestionAsync`, triggered by an `accomplishments/logged` event sent from `actions/accomplishments.ts`'s `addAccomplishment`). Card styling deliberately mirrors `EditorTab.tsx`'s private `BulletDiffCard` Was/Now language (that component isn't exported, so this is a parallel implementation, not a shared import) — but "Accept" here copies the bullet to the clipboard rather than silently inserting it into a résumé slot, since there's no single deterministic "base résumé" target in this app and a silent document write would break the Navigator-style action-confirm convention. Renders `null` (not an empty state) when the queue is empty — this is background-populated, ambient content, not something a user needs an explicit "nothing here yet" message for.

### Settings — "Browser extension" tab (§Q5 Capture Layer backend)

File: `components/settings/SettingsPanel.tsx` (`ExtensionTab`), `actions/apiKeys.ts`, `app/api/extension/capture-job/route.ts`, `lib/externalJob.ts`
Route: Settings modal (`?settings=1`) → "Browser extension" nav item, same `NAV`/`TabKey` pattern as the other 4 tabs
Last updated: 2026-08-17 (new)

**Pattern notes:**
Self-fetches its own data (`listApiKeys()`) via a `useEffect` on mount rather than through `SettingsModal.tsx`'s existing `/api/settings/me` prefetch — that endpoint's shape predates this feature and API keys are a distinct enough concern not to fold in. "Generate new key" shows the raw value exactly once in an agent-teal `border-agent bg-agent-light/50` banner with a Copy button (same visual language as every other "AI-adjacent, needs a second look" surface in this app, even though nothing here is AI-generated — reused for its "pay attention, this is important and transient" connotation) — after that it's gone from the UI forever, only the stored `key_prefix` shows in the list below. Revoke is a direct delete, no `ConfirmDialog` step (unlike account deletion) — a leaked/unused key has low blast radius and regenerating is free, so the extra confirmation friction wasn't worth it here.

**Backend split, for reuse**: `createExternalJob` (`lib/externalJob.ts`) holds the actual job-insert-plus-evaluation-trigger logic, called by both `actions/jobs.ts`'s cookie-authed `addExternalJob` (existing "paste a job from anywhere" flow) and the new bearer-token-authed `/api/extension/capture-job` route — same job creation, two different ways of resolving which user it's for. See `progress-tracker.md`'s Phase 14 §Q5 entry for a real bug this extraction surfaced and fixed (an unguarded `inngest.send()` failure used to fail the whole call even after the job row had already saved).

### Tooltip (new — first Tooltip primitive in this codebase)

File: `components/ui/Tooltip.tsx`
Last updated: 2026-08-20 (new)

**Pattern notes:**
Hand-rolled, not Radix — matching every other interactive primitive in this app (`ConfirmDialog.tsx`, `Tabs.tsx`, `CommandPalette.tsx`; no headless-UI dependency exists anywhere in this codebase, confirmed via a full `components/ui/` listing). Positioned panel above the trigger via `absolute bottom-full`/`-translate-x-1/2`, shown on hover OR focus (keyboard-accessible via a `tabIndex={0}` wrapper span), Escape-to-close wired in from day one — the accessibility audit (build-plan.md §H, an earlier phase) found every existing dropdown/popover in this app was missing that, no reason for a brand-new component to repeat it. First consumer: `EvaluationBreakdown.tsx`'s 10-dimension explanations, replacing a plain native `title` attribute with identical copy.

**Live-verified, with a real environment gotcha worth remembering**: dispatched synthetic `mouseenter`/`mouseover`/`focus` DOM events didn't trigger React's synthetic handlers in this session's Browser pane (a new instance of this project's recurring "browser automation vs. real React event delegation" gap, same family as previously-documented click/reveal quirks) — confirmed the component for real by calling the attached `onMouseEnter`/`onKeyDown` React prop functions directly via `element[__reactProps$...]`, which rendered the real correct copy (`"How well your listed skills align..."`) and correctly closed on a simulated Escape. This proves the component's own logic is correct; it does not prove a literal mouse hover in a real browser dispatches the event that reaches it — that part is standard React and not new risk, just not independently re-provable in this environment.

### Dashboard — "Customize" widget visibility (build-plan.md §P/§H)

File: `components/dashboard/CustomizeDashboardModal.tsx`, `actions/dashboardLayout.ts`, `lib/dashboardWidgets.ts`
Route: a "Customize" button at the top of `/dashboard`, opens via `SectionModal.tsx`'s existing chrome
Last updated: 2026-08-20 (new)

**Pattern notes:**
Show/hide only, deliberately no reorder — see `build-plan.md`'s §H row for the full reasoning (the bento-grid spans were their own researched design decision; reordering would mean either reinventing that span logic per arbitrary order or flattening it to a plain list). `app/dashboard/page.tsx` filters each row's widget list against `profiles.dashboard_hidden_widgets`, then picks a layout: the two combinations the row was actually designed for (with/without a real interviewing-stage job) keep their exact original Tailwind spans; anything else — only reachable by a user explicitly hiding something — falls back to a plain CSS `auto-fit` equal-width reflow via one inline `grid-template-columns`, so a hidden widget never leaves dead whitespace and the untouched-by-anyone default view is pixel-identical to before this feature shipped. `DASHBOARD_WIDGET_KEYS`/`DashboardWidgetKey` deliberately live in `lib/dashboardWidgets.ts`, not the `"use server"` `actions/dashboardLayout.ts` — a plain const/type export from a server-actions file is exactly the invariant violation `progress-tracker.md` already documented once (Phase 15, `actions/referralCopy.ts`), caught and fixed before it shipped this time rather than after.

**Live-verified on the real test account**: opened the modal, confirmed all 9 real widget rows render, toggled "Match Quality Histogram" off (confirmed the row's own class flipped from the visible to the hidden text-muted state before saving), saved, and confirmed on the real re-rendered dashboard that the Match Score Distribution chart was genuinely gone while Activity Heatmap and Upcoming Interviews correctly reflowed into the equal-width fallback grid (this exact visible-set combination isn't one of the two hand-tuned bento layouts, so it correctly fell through to the generic branch) — no dead whitespace. Restored the test account's `dashboard_hidden_widgets` back to `{}` afterward.

### Onboarding wizard (build-plan.md §H — real first-run flow)

File: `app/onboarding/page.tsx`, `components/onboarding/OnboardingWizard.tsx`, `actions/onboarding.ts`
Route: `/onboarding` — new first gate in the post-login redirect chain (`lib/auth.ts`'s `getPostLoginRedirectPath`, `app/(auth)/callback/route.ts`'s local copy), ahead of the existing `is_complete` → `/profile` check
Last updated: 2026-08-20 (new)

**Pattern notes:**
Real 3-step wizard replacing the static `/preview/onboarding` mockup — same `StepShell` progress-dot chrome, same category→role picker, same seniority/acquisition-source chip pickers, ported verbatim from the mockup's markup/constants but wired to real state and real server actions instead of local-only `useState`. Step 2 (résumé) reuses `actions/profile.ts`'s existing `uploadResume`/`extractProfile` directly rather than the newer multi-slot `ResumeManager` — onboarding only ever needs the one base résumé, and confirmed live that `ResumeManager`'s extra slot/version machinery has no importer in the real profile page's simpler flow. New gate column `profiles.onboarding_completed_at` (backfilled to account-creation time for all 8 pre-existing users) — a brand-new signup with this unset lands on `/onboarding` before the existing completeness gate ever runs; once submitted, `completeOnboarding()` stamps it and routes onward based on whether the merged profile is actually complete (`/dashboard` if yes, `/profile` if the user skipped the résumé step and still has required fields missing). New `profiles.acquisition_channel` column folds in "How did you find us?" on the wizard's own step 3, matching the mockup's original layout, rather than as a separate feature — distinct from `referral_code`/`referred_by_code` (peer-invite tracking, unrelated).

**Live-verified end to end**, not just build-clean: real login → real `/onboarding` redirect confirmed on a nulled test account → all 3 steps clicked through for real → DB row confirmed to hold the exact real picks after submit → correct conditional redirect (`/profile`, since no résumé was uploaded so the profile stayed incomplete) → a second direct `/onboarding` visit correctly bounces away instead of re-showing the wizard. Full detail in `build-plan.md`'s §H row.

### Settings — "Notion" tab (build-plan.md §G/Phase 16 — Notion export)

File: `components/settings/NotionTab.tsx`, `actions/notion.ts`, `lib/notion.ts`
Route: Settings modal (`?settings=1`) → "Notion" nav item, same `NAV`/`TabKey` pattern as the other tabs
Last updated: 2026-08-20 (new)

**Pattern notes:**
Same `ReferralsTab`/`ExtensionTab` two-state shape: a "not connected" state (paste a Notion internal-integration token, pasted via a native `<select>` once databases are listed) and a "connected" state (database name + last-synced-at row, same `border-border bg-surface-secondary` card as `ExtensionTab`'s key rows, `Unplug` icon disconnect button in the same corner position as `ExtensionTab`'s `Trash2` revoke). Deliberately a personal internal-integration-token model, not OAuth — the user creates their own free integration at `notion.so/my-integrations` and shares one database with it, so there's no public OAuth app for this app's own account to register or maintain (unlike Gmail/Calendar/Outlook, still blocked on exactly that). Push direction mirrors Missions' own scope exactly (`is_hidden = false`) so it never surprises a user with jobs they don't see in-app; read-back direction reuses the existing `createExternalJob`/Jina-reader external-job pipeline verbatim rather than a parallel importer.

**Verification tier, disclosed**: clean `tsc`/`eslint`/production build only. Not live-tested end-to-end — doing so needs a real Notion account and a real integration token, which only the user has; ask them to connect a test database and report back, or hand over a token for a one-time live check.

### ConfirmDialog (new — reusable destructive-action confirmation)

File: components/ui/ConfirmDialog.tsx
Last updated: 2026-08-07 (new)

**Pattern notes:**
Replaces `window.confirm()`/`window.alert()` (the raw unstyleable browser dialog — user-flagged as unprofessional from a live screenshot) with this app's own chrome, matching `SectionModal.tsx`'s exact glass-modal recipe (`bg-black/40 backdrop-blur-sm` scrim, `glass-panel-strong` card, `tw-animate-css` fade/zoom/slide entrance). `AlertTriangle` icon in a `bg-error/10 text-error` badge, destructive-red `bg-error text-error-foreground` confirm button (not `bg-accent` — this is a delete, not a neutral save). Controlled (`open`/`onConfirm`/`onCancel`/`pending`), not self-managing state — the caller owns which item is pending confirmation. Used by `ApplicationDocumentsCard.tsx`, `ResumeManager.tsx`, `ResumeAnalysisView.tsx` — reach for this over `window.confirm` for any new destructive action.

### Listing-status signal badge (shared pattern, not a component)

Logic: lib/jobStatus.ts (`getListingSignal`, `isStaleByAge`) — new 2026-08-07, researched via `agy`.
Consumers: `JobResultCard.tsx`, `JobActionBar.tsx`, `DocumentGenerator.tsx`.

**Pattern notes:**
Three confidence tiers, same class recipe everywhere it's shown — reuse this exact mapping rather than inventing a new one: `confirmed` (user-marked via `markJobUnavailable`) → `bg-warning text-warning-foreground` (solid); `likely` (auto-detected `dropped_from_search_at` — see `lib/actions/scraper.actions.ts`) → `bg-warning/15 text-warning` (tinted); `possible` (`isStaleByAge`, posted/found >45 days ago with no stronger signal) → `bg-surface-secondary text-text-muted` (neutral, same treatment as the existing "Posted X"/"Hidden" badges). `AlertTriangle` icon throughout. Deliberately status-aware at the consumption site, not baked into the badge itself: `DocumentGenerator.tsx` only shows its warning banner when `application_status === "draft"` — never once a job is applied to or further, since the tailored documents may be the only surviving record of that application.

### SettingsModal (primary settings surface, replaces the full-page route)

File: components/settings/SettingsModal.tsx (+ SettingsModalLoader.tsx, ssr:false wrapper — see its own comment for why), app/api/settings/me/route.ts
Last updated: 2026-07-29 (new, same day as SettingsPanel below) — a 2026-07-29 research pass via Gemini 3.1 Pro (`agy`) on modern SaaS settings UX recommended a centered "OS window" modal over a full-page route (Linear/Superhuman pattern). Implemented as a URL-state-driven modal (`?settings=1`, not local-only React state) so it stays bookmarkable/shareable and works with browser back — chose this over the research's suggested Next.js Intercepting Routes for less architectural complexity, same practical result. `Cmd/Ctrl+,` opens it from anywhere; Escape or the X button closes it. Uses `.glass-panel-strong` (chrome, matches this app's existing glass-is-for-floating-UI-only rule) at `max-w-4xl max-h-[85vh]`, `bg-black/40 backdrop-blur-sm` scrim. Mounted once in `app/layout.tsx` via `SettingsModalLoader`, which MUST stay `next/dynamic(..., { ssr: false })` — see that file's comment for the real hydration bug this fixes (a cold load with the query param already set left the modal unhydrated and permanently stuck loading; confirmed live via checking for React fiber attachment on the DOM node). `/settings` (the page below) still exists as a no-JS/hard-refresh fallback.

### SettingsPanel (shared content, rendered by both the modal and /settings)

File: components/settings/SettingsPanel.tsx
Last updated: 2026-07-29 (new) — matches `/preview/more`'s `SettingsPanel` mockup design exactly, real data only (no fake subscription/credits data). Rendered by both `SettingsModal` (primary path) and `/settings` (`app/settings/page.tsx`, fallback path).

Sidebar nav (4 tabs, `bg-accent-muted text-accent` active state, matches `Navbar`'s dropdown pattern): Login & security / Subscription / Credits & usage / Job alerts. Only Login & security has real content — the other three render a shared `NotYetAvailable` empty state (`text-text-primary` heading + `text-text-muted` body, centered, `py-16`) rather than fabricated data, since no monetization or notification-producing backend exists yet.

Login & security shows real `email` + real OAuth `providers` array from `insforge.auth.getCurrentUser()` (`border border-border` pill per provider, not the mockup's generic password-reset field — this app is OAuth-only today, so password reset only renders conditionally once a user actually has an `email` provider). Delete-account section: `border-error/30 bg-error/5` danger-zone card, click-to-reveal a type-`DELETE`-to-confirm input (`disabled` submit button until exact match) before calling `deleteAccount()` (`actions/account.ts`) — never a single-click destructive action.

### Logo / Wordmark

File: components/layout/Logo.tsx
Last updated: 2026-07-18 (corrected same-day to actually match the approved concept mockup — the first rebuild used mixed-case IBM Plex text with no tag; see ui-tokens.md's Font correction note)

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Text — mark      | `text-lg text-accent` (◆ glyph, `aria-hidden`)                                        |
| Text — wordmark  | `font-display text-[19px] font-bold uppercase leading-7 tracking-wide` — `text-text-primary` (`variant="dark"`, default) or `text-overlay-foreground` (`variant="light"`) |
| Text — tag       | `font-mono text-[11px] font-normal uppercase leading-none tracking-widest` — "SRT · 01", `text-text-muted` (dark variant) or `text-overlay-foreground/50` (light variant), `aria-hidden` |
| Spacing          | `inline-flex items-baseline gap-2.5`                                                  |
| Accent usage     | Mark glyph only — the wordmark text itself stays on the primary/surface token, not accent |

**Pattern notes:**
Text-based wordmark, not an image. `public/logo.png` (unreferenced by any code — kept only as a static asset) was regenerated 2026-08-20 with the real amber-diamond-on-ink mark, closing out the last stale "JobPilot" raster asset; the homepage's own hero/feature mockups were already rebuilt as real CSS/JSX in Phase 20, not baked screenshots, so there was nothing stale left there. `priority` prop is still accepted for backward compatibility with existing callers but is unused (no `<Image>` left to prioritize). New `variant` prop (`"dark" | "light"`) makes the wordmark theme-aware for use on both light surfaces (footer) and the dark ink navbar chrome — see the Navbar entry below.

### Login Card

File: components/auth/LoginCard.tsx
Last updated: 2026-07-27 (left panel switched from `landing-hero-glow` to `bg-surface-secondary` — the marketing-page gradient had leaked onto this functional auth page; now consistent with the app's flat-card system)

| Property         | Class                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Background       | `bg-surface` outer shell with `bg-surface-secondary` on the left auth storytelling panel                 |
| Border           | `border border-border`, `border-b border-border` on mobile split, `lg:border-r` on desktop split        |
| Border radius    | `rounded-[24px]` outer shell, `rounded-full` on the small OAuth security badge, `rounded-md` buttons     |
| Text — primary   | Hero `text-[clamp(2.35rem,5vw,4.25rem)] font-semibold leading-[0.96] tracking-[-0.04em] text-text-slate`, form title `text-3xl font-semibold leading-9 text-text-primary` |
| Text — secondary | `text-base leading-7 text-text-secondary sm:text-lg` for supporting copy, `text-sm leading-6 text-text-secondary` for form guidance |
| Spacing          | Outer `mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1440px] items-center justify-center px-4 py-12 sm:px-6 lg:px-8`, panels `p-8 sm:p-10`, actions `mt-8 grid gap-3` |
| Hover state      | Provider form buttons use `hover:bg-surface-secondary`; focus uses `focus-visible:outline-accent`        |
| Shadow           | `shadow-card` on the outer auth shell                                                                   |
| Accent usage     | `text-accent` on the InsForge security badge icon and Google provider icon                              |

**Pattern notes:**
Auth screens use a two-panel shell: a left explanatory panel with the established landing glow treatment and a right focused action panel. Provider actions are token-driven bordered form buttons with lucide icons and no hardcoded provider colors.

### Navbar

File: components/layout/Navbar.tsx
Last updated: 2026-08-06 (Phase 8, later same day — "Profile" moved off the top-level nav array onto the `UserCircle` icon, user-requested; previously rebuilt 2026-07-27 as a true 3-column grid to center the nav links, then made a floating inset rounded bar rather than edge-to-edge — matching Raycast's own nav structure, see Pattern notes)

**2026-08-06:** `navigationItems` no longer includes `/profile` — the `UserCircle` icon in the authenticated right-hand cluster (previously decorative) is now a real `Link` to `/profile`, active-state colored the same way as other nav items (`isItemActive`). One fewer competing item in an already-full horizontal bar (`Dashboard, Jobs, Resume, Agent, Interview` — 5 items plus a dropdown). The mobile menu, which renders from the same `navigationItems` array, gained its own explicit `Profile` link (would otherwise have silently lost mobile access to the page).

Global — rendered on both public pages (homepage, login) and authenticated pages (dashboard, find-jobs detail, profile) via the `isAuthenticated` prop, not landing-only despite the old entry name.

| Property         | Class                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Background       | `bg-overlay` via `.glass-panel-overlay` (solid flat chrome, no blur as of 2026-07-27 — fixed dark in both light and dark app themes) |
| Border           | `border-b border-border` hairline (via `.glass-panel-overlay`)                                            |
| Border radius    | `rounded-md` on CTA only                                                                                 |
| Text — primary   | `text-sm font-medium text-overlay-foreground/60` (inactive), `text-accent` (active)                       |
| Text — secondary | `bg-accent text-accent-foreground` primary-button pattern on CTA (not `landing-button-primary`, which is for light-surface sections) |
| Spacing          | `mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6 lg:px-8` — 3 columns: logo (left), nav (true-centered), actions (right) |
| Hover state      | `hover:text-overlay-foreground` on nav links (`duration-200 ease-in-out`), `hover:opacity-90` on CTA       |
| Shadow           | `none`                                                                                                   |
| Accent usage     | Active nav item, mark glyph on `Logo variant="light"`, CTA background                                    |

**Pattern notes:**
**2026-07-27 (second change, same day):** `header` itself is now just a `sticky top-4 z-40 mx-4 sm:mx-6 lg:mx-8` positioning wrapper — the actual chrome (`.glass-panel-overlay`, `rounded-2xl`) moved to the inner grid div, so the bar reads as a rounded floating card with a gap around it rather than an edge-to-edge strip (again matching Raycast's own nav structurally, not its content). `.glass-panel-overlay`'s CSS changed from `border-bottom` only to a full `border` on all sides to support this (a rounded box with only a bottom edge drawn looked broken — this also incidentally fixed the same visual gap on `FindJobsForm.tsx`'s console, which already combined this class with `rounded-2xl`). Because the navbar's total vertical footprint grew (16px top margin + 64px bar = 5rem, was flush 4rem), every page using `min-h-[calc(100vh-4rem)]` was updated to `calc(100vh-5rem)` to keep the math exact — `dashboard/page.tsx`, `profile/page.tsx`, `find-jobs/[id]/page.tsx`, `waitlist/page.tsx`, `LoginCard.tsx`.

**2026-07-27 (first change, same day):** container changed from a `flex justify-between` row to `grid grid-cols-[1fr_auto_1fr]` — with 3 unevenly-sized children, `justify-between` only guarantees equal *gaps* between them, it doesn't truly center the middle one; two equal `1fr` side columns are what actually centers the nav links regardless of how wide the logo or actions group happen to be. Matches Raycast's own nav layout (checked via `getBoundingClientRect()` measurements on raycast.com: logo pinned far-left, nav links centered as their own group, login/CTA pinned far-right — not their logo asset or content, just the structural arrangement). Logo and the actions group each got their own wrapper `div` so they behave as single grid items; nav link gap tightened `gap-8` → `gap-6`.

Top navigation is always a full-width dark ink bar (`bg-overlay`), matching the wordmark/hero-chrome treatment used elsewhere (e.g. `FindJobsForm.tsx`'s hero) — and stays that way in both light and dark app theme, since it's fixed branding, not something that should flip to a light bar. `Logo` renders with `variant="light"` here so the wordmark and tag stay legible against the dark background. Authenticated-state icon/link colors use opacity-modified `overlay-foreground` tokens (`text-overlay-foreground/50`, `text-overlay-foreground/70`), **not `surface`** — `surface` now has a real, different dark-mode value and would go invisible on this permanently-dark chrome once dark mode ships (see ui-tokens.md's Dark Mode section). `ThemeToggle` renders here (both branches, next to sign-out / the CTA) — see its own entry below.

### ThemeToggle

File: components/layout/ThemeToggle.tsx
Last updated: 2026-07-18 (new)

| Property      | Class                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| Icon color    | `text-overlay-foreground/60`, `hover:text-overlay-foreground`                              |
| Icon size     | `h-4 w-4` (lucide `Sun`/`Moon`), `h-5 w-5` clickable hit area                              |
| Spacing       | Rendered inline in `Navbar.tsx`'s right-side action group, `gap-6` from neighboring items  |

**Pattern notes:**
Client component using `useTheme()` from `next-themes`. Renders a `Moon` icon when the resolved theme is light (click to go dark) and a `Sun` icon when dark (click to go light). Guards against hydration mismatch with a `mounted` state flag — renders an empty `h-5 w-5` placeholder until mounted, since `next-themes` only knows the real theme client-side (localStorage/system preference). Only ever lives on the dark `bg-overlay` chrome, so it always uses `overlay-foreground` tokens, never `surface`.

### Landing Hero

File: components/homepage/Hero.tsx
Last updated: 2026-06-03

| Property         | Class                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Background       | `border border-border bg-surface` with `landing-hero-glow`                                                     |
| Border           | `border border-border` with `border-b border-border` separating copy from preview                              |
| Border radius    | `landing-button-*` on buttons, `rounded-[26px]` on browser frame                                               |
| Text — primary   | `text-[clamp(2.75rem,7vw,4.625rem)] font-semibold leading-[0.94] tracking-[-0.045em] text-text-slate`         |
| Text — secondary | `text-base leading-7 text-text-secondary sm:text-lg`                                                           |
| Spacing          | `px-6 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24`, buttons in `mt-9 flex ... gap-3`, preview in `px-4 pt-7`   |
| Hover state      | Shared hover from `landing-button-primary` and `landing-button-secondary`                                      |
| Shadow           | `landing-browser-shadow` on the dashboard image frame                                                          |
| Accent usage     | `landing-hero-glow` pastel band plus `landing-button-primary` primary CTA and `landing-button-secondary` secondary CTA |

**Pattern notes:**
Hero sections use the soft multicolor glow helper, centered headline copy, paired CTA buttons, and a large bordered product preview resting on a muted surface strip.

### Split Feature Panel

File: components/homepage/HowItWorks.tsx and components/homepage/Features.tsx
Last updated: 2026-06-03

| Property         | Class                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Background       | `landing-panel landing-grid` outer shell with `bg-surface` content and `bg-surface-tertiary` media side |
| Border           | `border border-border` outer shell with repeated `border-b border-border` item dividers        |
| Border radius    | `rounded-[22px]` to `rounded-[28px]` on inset media cards                                      |
| Text — primary   | `text-[clamp(2.2rem,5vw,3.6rem)] font-semibold ... text-text-slate`, item titles `text-lg font-semibold text-text-primary` |
| Text — secondary | `text-base leading-7 text-text-secondary`                                                      |
| Spacing          | Headings `px-9 py-9 sm:px-12 sm:py-12 lg:px-14 lg:py-16`, list rows `px-9 py-7`, media `px-6 py-10` |
| Hover state      | `none`                                                                                         |
| Shadow           | `landing-card-shadow` on image card in `HowItWorks`; plain bordered inset card in `Features`  |
| Accent usage     | `border-l-2 border-accent pl-5` for the first left-side callout, `border-l-2 border-success pl-5` for the middle right-side callout |

**Pattern notes:**
Feature storytelling panels alternate which side carries the visual. Copy stacks in bordered rows, and one row gets a colored left rule to anchor the section without changing the white card surfaces.

### Testimonial Section

File: components/homepage/SuccessStory.tsx
Last updated: 2026-06-03

| Property         | Class                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Background       | `landing-panel bg-surface`                                                                    |
| Border           | `border border-border`                                                                        |
| Border radius    | `rounded-full` on avatar only                                                                 |
| Text — primary   | `text-[clamp(2rem,4.1vw,3.2rem)] font-medium leading-[1.18] tracking-[-0.04em] text-text-slate` |
| Text — secondary | `text-sm text-text-secondary`                                                                 |
| Spacing          | `px-6 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24`, avatar row `mt-9 flex ... gap-3`           |
| Hover state      | `none`                                                                                        |
| Shadow           | `none`                                                                                        |
| Accent usage     | `text-xs font-semibold uppercase tracking-[0.22em] text-accent` for section eyebrow          |

**Pattern notes:**
Social proof is centered and quiet: one accent eyebrow, a large editorial quote, then a compact identity row with the avatar and role.

### CTA Banner

File: components/homepage/CTASection.tsx
Last updated: 2026-06-03

| Property         | Class                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Background       | `landing-panel landing-hero-glow`                                                                           |
| Border           | `border border-border`                                                                                      |
| Border radius    | `landing-button-*` on buttons                                                                                |
| Text — primary   | `text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[0.96] tracking-[-0.045em] text-text-slate`        |
| Text — secondary | `text-base leading-7 text-text-secondary sm:text-lg`                                                        |
| Spacing          | `px-6 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24`, actions in `mt-9 flex ... gap-3`                         |
| Hover state      | Shared hover from `landing-button-primary` and `landing-button-secondary`                                  |
| Shadow           | `none`                                                                                                      |
| Accent usage     | Same dark primary CTA and pastel glow pattern as the hero                                                   |

**Pattern notes:**
Bottom conversion banners reuse the hero treatment exactly, only with tighter copy width and no embedded product screenshot.

### ConnectedAccounts

File: components/profile/ConnectedAccounts.tsx
Last updated: 2026-06-04

| Property      | Class                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| Section shell | `rounded-2xl border border-border bg-surface p-6 shadow-card`                                         |
| Row           | `flex items-center justify-between gap-4 rounded-xl border border-border p-4`                         |
| Icon wrapper  | `flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-linkedin-light`               |
| Connect btn   | `rounded-lg bg-linkedin px-4 py-2 text-sm font-medium text-linkedin-foreground transition-opacity hover:opacity-90 disabled:opacity-60` |
| Save btn      | `rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60` |
| Disconnect    | `text-xs text-text-muted underline underline-offset-2 hover:text-text-secondary`                      |
| Error text    | `text-xs text-error`                                                                                   |

**Pattern notes:**
Client component with 3 button states: Connect (no context) → "I'm Connected" (pending context, new tab open) → Disconnect (connected). State held locally; `isConnected` initialised from server-fetched `linkedinConnected` prop. Fetch pattern matches `handleGenerate` in ResumeSection — plain `fetch` with loading/error state, no `useTransition`.

---

### Landing Buttons

File: app/globals.css
Last updated: 2026-06-03

| Property         | Class                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Background       | `landing-button-primary` uses a dark token-based gradient, `landing-button-secondary` uses a soft surface fill |
| Border           | `landing-button-primary` has a dark mixed border, `landing-button-secondary` uses `var(--color-border)` |
| Border radius    | `var(--radius-md)`                                                                            |
| Text — primary   | `landing-button-primary` sets `color: var(--color-accent-foreground)`                        |
| Text — secondary | `landing-button-secondary` sets `color: var(--color-text-primary)`                           |
| Spacing          | `min-height: 3rem`, `padding: 0.75rem 1.5rem`, `font-size: 0.875rem`, `font-weight: 500`    |
| Hover state      | Primary lifts and brightens, secondary lightens and shifts border toward accent              |
| Shadow           | Primary gets depth shadow plus inset highlight, secondary gets a subtle card-like shadow     |
| Accent usage     | Focus ring uses `var(--color-accent)`                                                        |

**Pattern notes:**
All landing-page CTAs should use these shared semantic classes instead of duplicating button styling inline. This keeps contrast and polish consistent across navbar, hero, and footer CTA areas.

### Landing Footer

File: components/layout/Footer.tsx
Last updated: 2026-06-03

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | `bg-surface`                                                                          |
| Border           | `border-x border-b border-border`                                                     |
| Border radius    | `none`                                                                                |
| Text — primary   | `text-sm font-medium text-text-secondary`                                             |
| Text — secondary | `text-sm font-medium text-text-secondary`                                             |
| Spacing          | `mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-10 sm:px-8 md:flex-row ... lg:px-10` |
| Hover state      | `hover:text-text-primary`                                                             |
| Shadow           | `none`                                                                                |
| Accent usage     | `none`                                                                                |

**Pattern notes:**
Footer stays minimal and horizontal at larger sizes, using the same max-width and horizontal padding rhythm as the navbar.

### Analytics Logout Link

File: components/analytics/PostHogLogoutLink.tsx
Last updated: 2026-06-03

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | Inherited through `className`; current usage passes `bg-surface`                      |
| Border           | Inherited through `className`; current usage passes `border border-border`            |
| Border radius    | Inherited through `className`; current usage passes `rounded-md`                      |
| Text — primary   | Inherited through `className`; current usage passes `text-sm font-medium text-text-primary` |
| Text — secondary | `none`                                                                                |
| Spacing          | Inherited through `className`; current usage passes `min-h-10 px-4 py-2`              |
| Hover state      | Inherited through `className`; current usage passes `hover:bg-surface-secondary`      |
| Shadow           | `none`                                                                                |
| Accent usage     | `none`                                                                                |

**Pattern notes:**
Analytics wrapper links should preserve the exact visual classes of the link or button they replace. The component owns only the PostHog reset behavior and must not introduce standalone styling.

---

### Profile Attention Banner

File: components/profile/ProfileAttentionBanner.tsx
Last updated: 2026-06-03

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | `bg-surface`                                                                          |
| Border           | `border border-border`                                                                |
| Border radius    | `rounded-2xl`                                                                         |
| Text — primary   | `text-sm font-semibold text-text-primary`                                             |
| Text — secondary | `text-sm text-text-secondary`                                                         |
| Spacing          | `p-6`, banner layout `flex items-start justify-between gap-6`                         |
| Hover state      | `none`                                                                                |
| Shadow           | `shadow-card`                                                                         |
| Accent usage     | SVG ring stroke uses `var(--color-accent)`; warning badges use `bg-warning text-warning-foreground` |

**Pattern notes:**
Completion ring is a pure SVG circle with `stroke-dashoffset` driven by the `completionPercent` prop. Missing field badges use `rounded-sm` (not pill) with warning color. Ring is 88×88px, radius 34, stroke-width 8.

---

### Connected Accounts

File: components/profile/ConnectedAccounts.tsx
Last updated: 2026-06-03

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | `bg-surface`                                                                          |
| Border           | `border border-border` outer card; `border border-border` inner provider row          |
| Border radius    | `rounded-2xl` outer, `rounded-xl` provider row, `rounded-lg` icon box                |
| Text — primary   | `text-sm font-medium text-text-primary`                                               |
| Text — secondary | `text-xs text-text-muted`                                                             |
| Spacing          | `p-6` card, `p-4` provider row                                                        |
| Hover state      | `hover:opacity-90` on connect button                                                  |
| Shadow           | `shadow-card`                                                                         |
| Accent usage     | LinkedIn button uses `bg-linkedin text-linkedin-foreground`; icon box `bg-linkedin-light` |

**Pattern notes:**
Each provider row is a self-contained flex row with icon, name/status text, and an action button on the right. LinkedIn brand colors always come from the `linkedin` token, never hardcoded.

---

### Resume Section

File: components/profile/ResumeSection.tsx
Last updated: 2026-06-04

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | `bg-surface` card, `bg-surface-secondary` drop zone default                           |
| Border           | `border border-border` card; `border-2 border-dashed border-border` drop zone         |
| Border radius    | `rounded-2xl` card, `rounded-xl` drop zone, `rounded-full` upload icon ring           |
| Text — primary   | `text-sm font-medium text-text-primary`                                               |
| Text — secondary | `text-xs text-text-muted`                                                              |
| Spacing          | `p-6` card, `py-10` drop zone, `mt-4 flex flex-col gap-3` footer area                 |
| Hover state      | `hover:bg-surface-secondary` Select Resume + Generate buttons; `hover:opacity-90` Extract button |
| Shadow           | `shadow-card` card, `shadow-card` upload icon ring                                    |
| Accent usage     | `border-accent bg-accent-muted` when dragging; Extract button `bg-accent text-accent-foreground` |

**Pattern notes:**
Drop zone switches from `border-border bg-surface-secondary` to `border-accent bg-accent-muted` on `isDragging`. Hidden `<input type="file">` triggered by the Select Resume button via a `ref`. Only PDF files accepted. `Extract Profile` button only renders when a resume exists (`existingResumeUrl || fileName`). Accepts `onExtracted` callback prop. Uses separate `useTransition` instances: `isExtracting` for the extract flow, `isGenerating` for the generate flow. Generate button calls `POST /api/resume/generate`, then opens `/api/resume/download` in a new tab on success. Both action rows show error/success feedback below the button using `text-sm text-error` / `text-sm text-success`.

### Profile Page Client

File: components/profile/ProfilePageClient.tsx
Last updated: 2026-06-04

Thin client wrapper that owns the `useRef<ProfileFormHandle>` connecting `ResumeSection.onExtracted` to `ProfileForm.applyExtracted`. Has no visible UI of its own — renders `<ResumeSection>` then `<ProfileForm>` with the ref wired between them.

---

### Profile Form

File: components/profile/ProfileForm.tsx
Last updated: 2026-06-03

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | `bg-surface`                                                                          |
| Border           | `border border-border` card; `border-t border-border` section dividers; `border border-border` work entry cards |
| Border radius    | `rounded-2xl` outer card, `rounded-xl` work entry cards, `rounded-lg` inputs/selects/buttons |
| Text — primary   | `text-sm font-semibold text-text-primary` section headings; `text-sm text-text-primary` body |
| Text — secondary | `text-xs font-medium uppercase tracking-wide text-text-secondary` form labels         |
| Spacing          | `p-6` body, `px-6 py-5` header, `px-6 py-4` footer, `space-y-8` section gaps         |
| Hover state      | `hover:bg-surface-secondary` secondary buttons; `hover:opacity-90` primary/Save button |
| Shadow           | `shadow-card`                                                                         |
| Accent usage     | `focus:ring-1 focus:ring-accent` on all inputs; `bg-accent-light text-accent` skill tags; `bg-accent text-accent-foreground` Save button |

**Pattern notes:**
Form labels use `text-xs font-medium uppercase tracking-wide` — all caps with letter-spacing, not sentence case. Tag inputs render removable pill chips with `bg-accent-light text-accent`. Work Experience entries are individually bordered sub-cards inside the main form card. Month/Year pickers use two adjacent `<select>` elements. Save Profile button is full-width at the bottom of the card.

---

*(`SearchControls`, `JobFilters`, `JobsTable`, `JobsPagination` were deleted 2026-07-18 along with the rest of the orphaned Adzuna pipeline — see `context/build-plan.md` Phase 6 item 18. Removed from this registry since the files no longer exist.)*

### FindJobsForm

File: components/find-jobs/FindJobsForm.tsx
Last updated: 2026-07-18 (job cards rebuilt to match the approved concept mockup's card design exactly, after you flagged the gap; hero/dark-mode-token work happened earlier same day)

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | Hero: `bg-overlay` (ink chrome, fixed dark in both app themes); results: `bg-surface` cards |
| Border           | Hero: `border-overlay`; inputs on hero: `border-overlay-foreground/15`; cards: `border-border`, `hover:border-accent` |
| Border radius    | `rounded-2xl` hero and cards, `rounded-lg` inputs/button, `rounded-[5px]` tag pills, `rounded-r-lg` agent callout |
| Text — primary   | Hero heading `text-overlay-foreground`; card title `text-text-primary`                |
| Text — secondary | Hero subtext `text-overlay-foreground/60`; card body `text-text-secondary`            |
| Spacing          | `p-8 md:p-12` hero, `p-5` cards (via shadcn `Card`), single-column list (`flex flex-col gap-4`), not a multi-column grid |
| Hover state      | `hover:opacity-90` submit button; `hover:border-accent hover:shadow-md` job cards     |
| Shadow           | `shadow-card` hero                                                                    |
| Accent usage     | `bg-accent text-accent-foreground` submit button; match score number tiered success/info/warning in `font-mono`; match reason uses the Agent Content treatment (see `ui-rules.md`) |

**Pattern notes:**
The hero is intentionally dark ink chrome (`bg-overlay`), matching the wordmark/nav frame treatment rather than a light card — this is the one place in the app a full-bleed dark surface is correct (alongside the navbar), and it stays dark in both light and dark app theme. Inputs on that dark surface use opacity-modified `overlay-foreground` tokens (`bg-overlay-foreground/8 border-overlay-foreground/15 placeholder:text-overlay-foreground/40`), **not `surface`** — `surface` has a real dark-mode value now and would go invisible here.

Job result cards are a two-column CSS grid (`grid-cols-[1fr_auto]`): left column is title/company·location/tag pills, right column is the match score (`font-mono text-2xl`, tiered) with a `Match` mono sub-label beneath it. Tag pills are built from real job fields only (`job_type`, a `Remote` tag inferred from `location`, up to 2 of `matched_skills`) via the `jobTags()` helper — never fabricated placeholder tags. The Agent Read box spans both grid columns (`col-span-2`) below the tags row, using `bg-agent-light`/`text-agent-dark` (not `bg-agent-muted`/`text-agent-foreground` — see the Agent Content correction in `ui-tokens.md`). Below the results list, a real "Last sortie · Xm ago" stamp (green `bg-success` dot + `formatTimeAgo()` from `lib/utils.ts`) reflects the most recent completed `agent_runs` row, server-fetched in `app/find-jobs/page.tsx` — no decorative action buttons were added since there was no real, non-contrived action for them at the list level.

---

### Tabs (primitive)

File: components/ui/Tabs.tsx
Last updated: 2026-07-22 (new)

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Tab list shell   | `flex w-fit gap-1 rounded-full border border-border bg-surface p-1`                   |
| Tab — active     | `bg-accent-light text-accent`                                                          |
| Tab — inactive   | `text-text-secondary`, `hover:text-text-primary`                                       |
| Tab              | `rounded-full px-4 py-1.5 text-sm font-medium transition-colors`                      |

**Pattern notes:**
Plain client component, local `useState` for active tab — no Radix/shadcn Tabs primitive exists in this codebase (no Radix dependency at all), so this was built from scratch rather than reusing an installed library. Takes `tabs: {id, label, content}[]` and an optional `defaultTabId`. No URL-param sync (tab resets on refresh) — a cheap future upgrade if ever needed, not built since not requested. First real use: `app/find-jobs/[id]/page.tsx`'s Overview/Company split, restructured from a single flat scroll to match JobRight's job-detail-page anatomy (`build-plan.md` §H1).

### JobActionBar

File: components/job-details/JobActionBar.tsx
Last updated: 2026-08-07 (gained a listing-status badge + "Mark unavailable" toggle pill, alongside the existing Posted/Remote/Hidden badges and Save/Hide/Mark-applied pills — see `lib/jobStatus.ts`'s entry below); previously 2026-07-27 (no longer sticky — see Pattern notes)

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Shell            | `glass-panel-strong flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4` (solid flat surface, no blur — see `ui-tokens.md`'s Liquid Glass section) |
| Save — active    | `border-accent bg-accent-muted text-accent`                                            |
| Save — inactive  | `border-border bg-surface text-text-secondary`, `hover:bg-surface-secondary`          |
| Apply CTA        | `bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground`, `hover:opacity-90` |
| Badges           | `rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-muted` (freshness/hidden), `bg-info-lightest text-info` (Remote) |

**Pattern notes:**
**2026-07-27:** dropped `sticky top-16` entirely — once `Navbar` became its own floating/sticky bar (see its entry above), stacking a second sticky bar directly underneath read as two competing pinned elements, and needed its own top offset kept in sync with `Navbar`'s height (a dependency that already broke once: `top-16` briefly overlapped the new floating navbar's bottom edge before this was simplified to not-sticky at all). This bar is now plain in-flow — Save/Hide/Apply scroll away with the rest of the page, same as any other section.

Replaces the old top-of-page `JobActions` (back link + bare apply link) and the bottom-of-page duplicate apply button (deleted, consolidated into this one bar) — matches JobRight's single top action bar rather than two separate CTAs. Owns real Save/Hide state (optimistic update + `actions/jobs.ts`'s `toggleSaveJob`/`toggleHideJob`), and displays `postedAt`/`isRemote` when available (see the Job Details Page entry below for where that data comes from).

### Qualification

File: components/job-details/Qualification.tsx
Last updated: 2026-08-17 (§Q2 — added the "Sortie remembered..." correction-memory line; tag-row/legend layout below unchanged since 2026-07-24)

| Property           | Class                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| Shell              | `rounded-2xl border border-border bg-surface p-6 shadow-card` (matches other job-detail cards) |
| Header             | `h-8 w-8 rounded-full bg-surface-secondary` icon circle (`Award`, `lucide-react`) + `text-base font-semibold` title — same pattern as `JobDescription`/`Responsibilities`/`Benefits` |
| Legend (top-right) | `text-xs text-text-muted` + small `text-success` check icon — "Represents the skills you have" |
| Intro copy         | `text-sm leading-6 text-text-secondary`                                               |
| Matched skill tag  | `bg-success-lightest px-3 py-1 text-xs font-medium text-success-foreground`, clickable |
| Gap skill tag      | `bg-accent-muted px-3 py-1 text-xs font-medium text-accent`, clickable                |
| Required/Preferred | Plain `list-disc` bullet columns, `sm:grid-cols-2`                                    |

**Pattern notes:**
Consolidates what used to be split across two components: correctable skill tags (previously a static, non-interactive section in `MatchScore.tsx` — now clickable, moves a skill between matched/missing via `actions/jobs.ts`'s `correctSkillTag`, optimistic update with rollback on failure) and the Required/Preferred lists (previously two of `JobDescription.tsx`'s four bullet sections). Correcting a tag is a data fix on THIS job only — does not re-run the AI evaluator or change `match_score` for the job being corrected. Reuses the exact skill-badge token pair already spec'd elsewhere (`bg-success-lightest`/`text-success-foreground` for matched, `bg-accent-muted`/`text-accent` for missing) rather than inventing new ones. **2026-07-24:** tags were originally split into two labeled sections ("You have" / "Gap skills"); merged into one `flex flex-wrap` row (matched tags first, then gap tags) to match JobRight's actual layout — the check/✕ icon on each tag is now the only thing distinguishing them, plus the header legend restating what the check means.

**§Q2 addition (2026-08-17):** every correction also writes a `skill_corrections` row (see `progress-tracker.md`'s Phase 14 entry) that biases *future* evaluations for the same `normalizeRoleFamily(title)` — so while a correction never touches the job being corrected, it does compound across future jobs in the same role family. `correctionsAppliedCount`/`roleFamily` props (computed server-side, a cheap `{count:"exact", head:true}` query) drive one small `text-xs text-text-muted` line — "Sortie remembered N thing(s) you told it about your {role family} skills" — rendered between the intro copy and the tag row, only when `correctionsAppliedCount > 0`. Deliberately no new interactive UI for this — the existing tag-click is still the only way to create a correction, this line just makes the resulting memory mechanism visible rather than silent.

### Responsibilities

File: components/job-details/Responsibilities.tsx
Last updated: 2026-07-24 (new — split out of `JobDescription.tsx`)

| Property | Class                                                                                  |
| -------- | --------------------------------------------------------------------------------------- |
| Shell    | `rounded-2xl border border-border bg-surface p-6 shadow-card`                          |
| Header   | `h-8 w-8 rounded-full bg-surface-secondary` icon circle (`Briefcase`, `lucide-react`) + `text-base font-semibold` title |
| List     | Plain `list-disc` bullets, single column                                                |

**Pattern notes:**
Was previously one of `JobDescription.tsx`'s bullet sections; pulled into its own card to match a real JobRight screenshot, which shows Responsibilities/Qualification/Benefits as three visually distinct cards rather than sub-sections of one "Job Description" block. Renders nothing if `job.responsibilities` is empty (`return null`), same guard pattern as the other optional job-detail cards.

### Benefits

File: components/job-details/Benefits.tsx
Last updated: 2026-07-24 (new — split out of `JobDescription.tsx`)

| Property | Class                                                                                  |
| -------- | --------------------------------------------------------------------------------------- |
| Shell    | `rounded-2xl border border-border bg-surface p-6 shadow-card`                          |
| Header   | `h-8 w-8 rounded-full bg-surface-secondary` icon circle (`Gift`, `lucide-react`) + `text-base font-semibold` title |
| List     | `list-disc` bullets in a `grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3`           |

**Pattern notes:**
Same split-out story as Responsibilities above. Rendered as a multi-column grid (not a single vertical list) to match JobRight's layout — most benefit entries are short phrases, so 2-3 columns reads better than a long single column. Renders nothing if `job.benefits` is empty.

### HiringProcess

File: components/job-details/HiringProcess.tsx
Last updated: 2026-07-24 (new)

| Property | Class                                                                                  |
| -------- | --------------------------------------------------------------------------------------- |
| Shell    | `rounded-2xl border border-border bg-surface p-6 shadow-card`                          |
| Header   | `h-8 w-8 rounded-full bg-surface-secondary` icon circle (`ListOrdered`, `lucide-react`) + `text-base font-semibold` title |
| List     | `list-decimal` (numbered, unlike the other bullet-list cards — this is a sequence)     |

**Pattern notes:**
New card, found via structural analysis of 25 real scraped postings (not guessed) — interview/application process detail (steps, format, timeline) is a real, recurring, differentiated category most postings don't have but some describe in real detail (e.g. a full "Application Review → Intro Chat → Technical Deep Dive → Decision" pipeline). Renders nothing if `job.hiring_process` is empty — most postings won't have this, and that's expected, not a bug. Placed after Benefits in `app/find-jobs/[id]/page.tsx`'s Overview tab.

### Insider Connections

File: components/job-details/InsiderConnections.tsx (+ InsiderConnectionsButton.tsx, EmailLookupButton.tsx, shared/LinkedInGlyph.tsx)
Last updated: 2026-07-23 (new)

| Property           | Class                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| Shell              | `rounded-2xl border border-border bg-surface shadow-card` (outer), `border-b border-border p-6` header |
| Bucket shell       | `rounded-xl border border-border bg-surface-secondary p-3`                            |
| Bucket header pill | `bg-success-lightest text-success-foreground` (Beyond Your Network), `bg-info-lightest text-info` (Previous Company), `bg-accent-muted text-accent` (School) |
| Person row         | `rounded-lg border border-border bg-surface p-3`, initials avatar `bg-accent-muted text-accent` |
| Email button       | icon-only `h-7 w-7 rounded-full border border-border`; found state `bg-success-lightest text-success-foreground` pill with the real email as link text |
| LinkedIn button    | icon-only `h-7 w-7 rounded-full border border-border`, uses `LinkedInGlyph` (inline SVG — `lucide-react`'s installed version dropped brand/logo icons entirely, no `Linkedin` export) |

**Pattern notes:**
Three-bucket layout matching a real JobRight screenshot exactly (Beyond Your Network / From Your Previous Company / From Your School). Paid, opt-in only (`InsiderConnectionsButton`), same `*LookedUp` three-state pattern as Leadership Team (not-looked-up / looked-up-empty / looked-up-found) built in from the start. Lives in the **Company tab**, not Overview — it shares Leadership's "company research must already exist" prerequisite, and placing it in Overview would let a user hit that error before ever visiting the tab that triggers the prerequisite. `EmailLookupButton` is per-person, searches by the person's already-known first/last name + the job's resolved LinkedIn company URL (cached on the connections payload as `companyLinkedinUrl`) — not URL-based, since the underlying Apify actor is filter-based only. See `progress-tracker.md`'s 2026-07-22/23 entry for the full cost/vendor story.

### NetworkSignals

File: components/shared/NetworkSignals.tsx
Last updated: 2026-07-22 (rewritten twice same session — see progress-tracker.md for the full story)

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Shell            | `rounded-2xl border border-border bg-surface shadow-card`, `border-b border-border p-6` header |
| Fact badge       | `bg-success-lightest px-3 py-1 text-xs font-medium text-success-foreground` (**not** `bg-agent-light`/`text-agent-dark` — that pair is reserved for AI-*generated* content only; this is a deterministic string match, a mistake caught and fixed this session) |
| Hint chips       | `bg-surface-secondary px-2.5 py-1 text-xs font-medium text-text-secondary`             |
| CTA              | `bg-accent px-4 py-2 text-sm font-medium text-accent-foreground`, `hover:opacity-90`  |

**Pattern notes:**
The free, always-available counterpart to the paid Insider Connections feature (see that entry above) — placed in the Overview tab, no prerequisite. Shows only what's actually knowable for free: whether the candidate's own `work_experience` includes the exact hiring company (`lib/networkSignals.ts`'s `findPreviousEmployerMatch`), plus a LinkedIn people-search link scoped to the hiring company alone (not a jumbled multi-term query — see progress-tracker.md for why that broke). Deliberately does not claim a headcount ("3 former colleagues work here") the way JobRight's version does — no free data source exists for that, and inventing one would violate this app's own "never invent a fact" principle.

### JobResultCard

File: components/shared/JobResultCard.tsx
Last updated: 2026-08-07 (gained a listing-status signal badge + "No Longer Available" item in the existing "..." menu, alongside Already Applied/Not Interested/Report Issue — see `lib/jobStatus.ts`'s entry below); previously 2026-07-27 (glass hover effect retuned — see below)

| Property     | Class                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| Shell        | Real `Card` UI primitive (`components/ui/card.tsx`), not a reimplemented div — `className="border border-border bg-surface shadow-card card-interactive-glow grid cursor-pointer grid-cols-[1fr_auto] items-start gap-4 rounded-2xl p-5"` merged over Card's shadcn base classes. `.card-interactive-glow` (renamed 2026-07-27 from `.glass-panel-interactive`, `app/globals.css`) adds the hover lift + cursor-tracked highlight — see `ui-tokens.md`'s Liquid Glass section |
| Score badge  | `font-mono text-2xl font-semibold tabular-nums`, tiered via the standard Match Score Colors (`text-success`/`text-info`/`text-warning`) |
| Tag pills    | `rounded-[5px] border border-border px-2 py-0.5 text-[11px] text-text-secondary` — real fields only (`job_type`, remote text-match, first 2 `matched_skills`), never fabricated |
| Agent read   | Standard Agent Content treatment (`border-agent`, `bg-agent-light`, `text-agent-dark` mono label) |

**Pattern notes:**
Used by both `FindJobsForm.tsx`'s results list and the new Saved Jobs page (see that entry below) — same card, two different data sources (current search vs. all-time saves). Deliberately kept as the actual `Card` primitive with the original className rather than a hand-rebuilt div, since shadcn's `Card` base uses its own raw tokens (`bg-card`, `ring-1 ring-foreground/10`, `rounded-xl`) that don't match this app's design system — an approximate rebuild risked silently drifting from the real rendered output.

### Saved Jobs Page

File: app/saved-jobs/page.tsx
Last updated: 2026-07-24 (new)

| Property   | Class                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| Page shell | `mx-auto flex w-full max-w-7xl flex-col gap-8 p-8` — matches Find Jobs page shell     |
| Title      | `text-4xl font-bold tracking-tight text-text-primary`                                |
| List       | `flex flex-col gap-4` of `JobResultCard`                                              |

**Pattern notes:**
Queries `jobs` by `user_id` + `is_saved = true` with no `run_id` scoping, unlike the Find Jobs list — a save must stay visible regardless of how many new searches happen afterward. Nav link added to `Navbar.tsx` between Find Jobs and Profile.

### Job Details Page

File: app/find-jobs/[id]/page.tsx and components/job-details/*
Last updated: 2026-07-23 (restructured into Overview/Company tabs, JobActionBar, Qualification, Insider Connections — see their own entries above; superseded the 2026-06-05 layout below in structure, not in every token)

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Page shell       | `mx-auto flex min-h-[calc(100vh-4rem)] max-w-[820px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-0` |
| Cards            | `rounded-2xl border border-border bg-surface p-6 shadow-card`; research card uses `overflow-hidden` and a `border-b border-border` header |
| Header icon      | `flex h-14 w-14 ... rounded-2xl border border-border bg-surface-secondary`; info icons use `h-10 w-10 rounded-xl` with token backgrounds |
| Text — primary   | Page title `text-2xl font-semibold leading-8 text-text-primary`; card headings `text-base font-semibold leading-6 text-text-primary`; body `whitespace-pre-line text-sm font-medium leading-6 text-text-primary` |
| Text — secondary | Section eyebrows `text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary`; labels `text-xs font-medium uppercase leading-4 tracking-wide text-text-muted` |
| Buttons          | Primary CTA `min-h-12 w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-foreground`; secondary external link `min-h-10 rounded-lg border border-border bg-surface px-4 py-2` |
| Badges           | Match score `rounded-full bg-success-lightest px-3 py-1 text-xs font-medium text-success-foreground`; matched skills `bg-success-lightest text-success-foreground`; gap skills `bg-accent-muted text-accent` |
| Empty state      | `flex min-h-64 flex-col items-center justify-center px-6 py-14 text-center` with `h-12 w-12 rounded-2xl bg-surface-secondary` icon shell and `bg-accent-muted text-accent` helper badge |

**Pattern notes:**
Job detail pages use a narrow centered column rather than the full dashboard width. Job descriptions render the complete stored text with `whitespace-pre-line`, append any populated structured bullet sections, and show a bordered `View Full Job Post` notice when the saved Adzuna preview ends with `…` or `...`. Company research now renders a saved 9-field dossier read-only; once research exists, the generate action is hidden. Authenticated app pages pass `isAuthenticated` to `Navbar` so the top-right user icon and sign-out action match the signed-in designs.

**Update 2026-07-24:** Overview tab card order changed to `MatchScore` → `EvaluationBreakdown` → `JobDescription` → `Responsibilities` → `Qualification` → `Benefits` → `NetworkSignals`. `JobDescription` now renders only the "about role" paragraph + full-post-link (its old Responsibilities/Benefits bullet sub-sections were split into their own standalone cards — see those entries above) — matches a real JobRight screenshot, which shows these as visually distinct cards rather than sub-sections of one block.

**Update 2026-07-18:** `MatchScore.tsx`'s "AI Match Reasoning" section now uses the Agent Content treatment (`border-agent`, `bg-agent-light`, `text-agent-dark` mono label reading "Agent read") instead of a generic `bg-success-lightest` sparkle icon — see `ui-rules.md`'s Agent Content section. (Corrected same day from `bg-agent-muted`/`text-agent-foreground` to `bg-agent-light`/`text-agent-dark`, matching the approved mockup's exact tint/ink pair — see the Agent Content correction note in `ui-tokens.md`.) The Company Research dossier (`CompanyResearch.tsx`) has not been updated yet and still uses its original neutral card treatment despite also being AI-generated content — apply the same (corrected) treatment there next time that component is touched.

### Document Generator

File: components/job-details/DocumentGenerator.tsx
Last updated: 2026-07-18 (new — Phase 11 Feature 30, shipped ahead of its numbered place; see `build-plan.md`)

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | Outer `bg-surface`; each action panel `bg-surface-secondary`                          |
| Border            | `border-border` outer card and border-b header divider; `border-border` action panels |
| Border radius    | `rounded-2xl` outer, `rounded-xl` action panels, `rounded-lg` buttons                 |
| Text — primary   | `text-base font-semibold text-text-primary` card heading; `text-sm font-semibold text-text-primary` action labels |
| Spacing          | Header `p-6`, body `p-6` with `gap-4` (row on `sm:`, column below), action panel `p-4` |
| Hover state      | `hover:opacity-90` generate button; `hover:underline` view link                       |
| Shadow           | `shadow-card` on outer card only                                                      |
| Accent usage     | Header icon `bg-accent-muted text-accent` (matches Company Research's header, **not** the Agent Content teal — that treatment is reserved for the generated content callout itself, not section chrome); Generate button `bg-accent text-accent-foreground`; View link `text-accent` |

**Pattern notes:**
Two independent `DocumentAction` panels (Tailored Resume, Cover Letter) inside one card, matching the two-column layout of `ResumeSection.tsx`'s action rows. Each panel owns its own `useTransition`/error state and calls `POST /api/documents/generate` with `{ jobId, kind }`; on success calls `router.refresh()` (same pattern as `ResearchCompanyButton.tsx`) rather than managing the PDF URL in local state, so a reload always reflects the real saved state. "View" link only renders once a document exists, and points at `GET /api/documents/download?jobId=&kind=`, which streams the stored PDF — mirrors the existing `/api/resume/download` route rather than exposing a raw storage URL. Each panel also renders a `DocumentChatEditor` once a document exists — see below.

### Document Chat Editor

File: components/job-details/DocumentChatEditor.tsx
Last updated: 2026-07-18 (new — Phase 11 Feature 32, shipped ahead of its numbered place; see `build-plan.md`)

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | `bg-surface` outer panel; user bubble `bg-accent-muted`; AI bubble `bg-agent-light`   |
| Border            | `border-border` outer panel; AI bubble `border-l-2 border-agent` (Agent Content treatment, not decorative) |
| Border radius    | `rounded-lg` outer panel and both bubble types except AI's `rounded-r-lg` (never rounded on the accent side, per `ui-rules.md`) |
| Text — primary   | User bubble `text-text-primary`; AI bubble `text-agent-dark`; label `font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted` reading "Refine with AI" |
| Spacing          | `p-3` outer panel, `gap-2` message list (`max-h-48 overflow-y-auto`), input row `gap-2` |
| Hover state      | `hover:opacity-90` send button                                                        |
| Shadow           | `none`                                                                                |
| Accent usage     | Send button `bg-accent text-accent-foreground`; input focus ring `ring-accent`        |

**Pattern notes:**
Nested inside each `DocumentGenerator.tsx` action panel, one instance per document (`resume` / `cover_letter`), only rendered once that document exists. Message history is local `useState`, in-memory only — not persisted, resets on navigation away. User messages are plain neutral bubbles (right-aligned); AI replies use the Agent Content color pair (`border-agent`/`bg-agent-light`/`text-agent-dark`) since they're genuinely agent-generated text — this is the same rule everywhere else in the app, just applied at chat-bubble scale rather than a full callout block, and deliberately doesn't repeat the "Agent read" mono label per-bubble (turn-taking position already establishes which side is the AI, unlike a standalone card). Sends the full accumulated message list to `POST /api/documents/chat` on every turn (server re-derives the current document content itself rather than trusting the client) and calls `router.refresh()` on success so the "View" link in the parent `DocumentAction` reflects the newly revised PDF.

### Company Research Dossier

File: components/job-details/CompanyResearch.tsx, components/job-details/CompanyResearchAutoLoader.tsx, components/job-details/LeadershipTeamButton.tsx
Last updated: 2026-07-28 (AutoResearchCompany.tsx renamed to CompanyResearchAutoLoader.tsx — the old name read as a verb phrase/action rather than a UI component noun, design review feedback). Previously 2026-07-23 (Leadership Team section + industry tags added; ResearchCompanyButton.tsx replaced by AutoResearchCompany.tsx — auto-fires on first mount of the Company tab instead of waiting for a manual click, same underlying API route/gates)

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | `bg-surface` outer card; `bg-surface-secondary` inner dossier panels                  |
| Border           | `border border-border` outer card and inner panels; `border-b border-border` header; `border-t border-border` sources footer |
| Border radius    | `rounded-2xl` outer card, `rounded-xl` panels, `rounded-lg` section icons and button, `rounded-full` tags |
| Text — primary   | `text-base font-semibold leading-6 text-text-primary` card heading; `text-sm font-semibold leading-5 text-text-primary` section headings; `text-sm font-medium leading-6 text-text-primary` body |
| Text — secondary | `text-xs font-medium uppercase tracking-wide text-text-muted` source label; `text-xs text-error` and `text-xs text-success` button feedback |
| Spacing          | Header `p-6`, body `p-6` with `gap-6`, inner panels `p-4`, list items `space-y-2`     |
| Hover state      | Research button `hover:opacity-90`; source links `hover:text-text-primary`            |
| Shadow           | `shadow-card` on outer card only                                                      |
| Accent usage     | Button `bg-accent text-accent-foreground`; tech tags `bg-accent-muted text-accent`; section icon shells rotate between `bg-accent-muted`, `bg-success-lightest`, and `bg-info-lightest` token backgrounds |

**Pattern notes:**
The research card preserves the Feature 12 card shell and header, then swaps between an empty state with a client action and a dense read-only dossier. The client action lives in its own component, uses plain `fetch` plus `useTransition`, and calls `router.refresh()` after the API saves research. Dossier sections should stay compact, token-driven, and source-linked; do not add a refresh action unless Feature 13 scope changes.

**2026-07-23 additions:** `industryTags` renders as a small pill row under the overview paragraph (`bg-surface px-3 py-1 text-xs font-medium text-text-secondary`), guarded with `research.industryTags && research.industryTags.length > 0` since cached dossiers from before this field existed have it as `undefined`, not `[]` — a plain `.length` check would throw on those. Leadership Team renders as photo cards (matching JobRight's own treatment, not a table row) via the shared `LeaderCard` pattern (initials-avatar fallback when no real photo, LinkedIn icon badge overlaid bottom-right when a `linkedinUrl` exists) — see the Insider Connections entry above for the sibling feature this pattern was extended into.

---

### StatsBar

File: components/dashboard/StatsBar.tsx
Last updated: 2026-06-05

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | `bg-surface`                                                                          |
| Border           | `border border-border`                                                                |
| Border radius    | `rounded-2xl`                                                                         |
| Text — primary   | `text-3xl font-semibold leading-9 text-text-primary` stat value                       |
| Text — secondary | `text-sm font-medium text-text-secondary` label; `text-xs text-text-muted` sub-label  |
| Spacing          | `p-6` card, `mt-2` between value and trend row, `gap-2` trend row                    |
| Trend badge      | `rounded-sm bg-success-lightest px-2 py-0.5 text-xs font-medium text-success-darker` |
| Shadow           | `shadow-card`                                                                         |

**Pattern notes:**
Four cards in a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`). Trend badge only renders when a `trend` string is present. Badge uses `TrendingUp` lucide icon at `h-3 w-3`.

---

### RecentActivity

File: components/dashboard/RecentActivity.tsx
Last updated: 2026-06-05

| Property         | Class                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Background       | `bg-surface`                                                                          |
| Border           | `border border-border`                                                                |
| Border radius    | `rounded-2xl`                                                                         |
| Text — primary   | `text-sm font-medium leading-5 text-text-primary` activity text                       |
| Text — secondary | `text-xs text-text-muted` timestamp                                                   |
| Spacing          | `p-6` card, `mt-5 space-y-5` list, `gap-3` item row                                  |
| Shadow           | `shadow-card`                                                                         |
| Dot — job_found  | outer `h-4 w-4 rounded-full bg-success-light`, inner `h-2 w-2 rounded-full bg-success-alt` |
| Dot — researched | outer `h-4 w-4 rounded-full bg-info-light`, inner `h-2 w-2 rounded-full bg-info`     |

**Pattern notes:**
Activity dots use inline `style` with CSS variables for the exact token colors (success-light/success-alt, info-light/info) since Tailwind v4 generates classes from these tokens but the dot outer ring needs the `background` shorthand. `mt-0.5` on the dot aligns it with the first line of multi-line activity text.

---

### Analytics Charts

File: components/dashboard/AnalyticsCharts.tsx
Last updated: 2026-06-05

| Property      | Value                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| Library       | `recharts` — `BarChart`, `AreaChart`, `ResponsiveContainer`                     |
| Chart height  | `h-55` (220px) container, `ResponsiveContainer width="100%" height="100%"`      |
| Grid lines    | `vertical={false}`, `stroke="var(--color-border)"`, `strokeDasharray="4 4"`    |
| Axis labels   | `fill: "#9CA3AF"`, `fontSize: 12`, `axisLine={false}`, `tickLine={false}`       |
| Tooltip       | `borderRadius: 8`, `border: "1px solid var(--color-border)"`, `fontSize: 12`   |
| Research bars | `fill="var(--color-info)"`, `radius={[4,4,0,0]}`, `maxBarSize={40}`             |
| Jobs area     | `stroke="var(--color-accent)"`, `strokeWidth={3}`, gradient fill id `jobsGradient` (opacity 0.2→0) |
| Match bars    | `fill="var(--color-success)"`, `radius={[4,4,0,0]}`, `maxBarSize={60}`          |
| Card shell    | `rounded-2xl border border-border bg-surface p-6 shadow-card`                  |

**Pattern notes:**
Three named exports from one file — `CompanyResearchChart`, `JobsOverTimeChart`, `MatchDistributionChart`. All are `"use client"` (recharts needs browser). Colors use CSS variable references (`var(--color-*)`) so they stay token-driven inside recharts props. Left margin is `left: -20` on all charts to trim excess YAxis whitespace. Area gradient defined in `<defs>` with id `jobsGradient`.

---

### CompanyLogo

File: components/shared/CompanyLogo.tsx
Last updated: 2026-07-28 (new — went through 6 live-iterated versions the same day, see progress-tracker.md's top entry for the full sequence)

| Property | Class |
| --- | --- |
| Box (no logo/failed) | `flex h-14 w-14 (md) / h-20 w-20 (lg) flex-shrink-0 items-center justify-center rounded-xl/rounded-2xl border border-border bg-surface-secondary`, `Building2` icon inside |
| Box (real logo) | Same size/border/bg, `object-contain`, small padding, real `<img>` |

**Pattern notes:**
Two real candidate sources tried in order: `logoUrl` prop (a real SerpApi thumbnail, or — for jobs evaluated 2026-07-28 onward — a domain-based logo URL built from `lib/evaluator.ts`'s `companyDomain` field, which asks Gemini to resolve the company's real domain from its own knowledge, not string-guessed), then a client-side naive domain guess (`company.toLowerCase()`, strip legal suffixes) as a safety net for the rest of the existing catalog that hasn't been re-evaluated under the new pipeline. The naive-guess candidate is routed through `/api/logo?url=` (same-origin proxy with a small explicit host allowlist), not fetched directly, so a real error always fires the client's `onError` reliably regardless of the upstream's own failure mode. Source is `unavatar.io`, not Clearbit — **2026-07-28, later session:** `logo.clearbit.com` turned out to be fully DNS-dead (confirmed live via `curl`/`nslookup`), not ad-blocker-blocked as first theorized; swapped to `unavatar.io` everywhere (this component, the proxy's allowlist, and `lib/inngest/functions.ts`'s DB-write fallback), plus a one-time backfill of 17 existing DB rows that had a dead Clearbit URL persisted. Google's favicon service was tried twice and reverted both times — it silently serves its own generic placeholder for a domain it doesn't recognize (200 status, not a 404), which defeats error-based fallback logic and reads worse than the plain icon; `unavatar.io` was live-confirmed to return a real error (`403` with `?fallback=false`) instead. Used by `JobResultCard.tsx` (size `md`, 56px) and `JobInfo.tsx`'s header (size `lg`, 80px).

### ComingSoon

File: components/shared/ComingSoon.tsx
Last updated: 2026-07-28 (new)

| Property | Class |
| --- | --- |
| Icon chip | `flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-secondary`, accent-colored icon |
| Body | Centered column, `min-h-[calc(100vh-10rem)]`, title + one-line description |

**Pattern notes:**
Shared placeholder for `/agent`, `/interview`, `/settings`, `/notifications` — real routes (so nav links don't 404) with no backend, explicitly deferred per your own scoping rather than half-built. Takes `icon`/`title`/`description` props.

### SectionModal (shared scoped-edit dialog)

File: components/profile/SectionModal.tsx
Last updated: 2026-08-05 (new)

| Property | Class |
| --- | --- |
| Scrim | `fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm` |
| Panel | `glass-panel-strong flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl` |

**Pattern notes:**
Extracted from `ProfileForm.tsx`'s per-section edit modals (Personal/Professional/Education/Work Experience/Preferences) — same centered "OS window" glass-chrome recipe as `SettingsModal`, deliberately reused rather than inventing a second modal pattern. Takes `title`/`onClose`/`onSave`/`saving`/`children`; footer is a fixed Cancel/Save pair, body is whatever form fields the caller passes as children.

### ResumeManager (multi-résumé slot list)

File: components/profile/ResumeManager.tsx
Last updated: 2026-08-13 (Phase 11 — mobile-responsive fix)

**Pattern notes:**
Real backend for `/resume` — up to 5 named résumé slots (`resumes` table), one marked primary (star badge, `bg-accent-muted text-accent`), status pill (`uploaded` / `analysed`, `bg-success-lightest`), per-row actions menu (Make Primary / Sync to Profile / Rename / Export / Delete — Delete disabled while primary). Upload modal is drag-and-drop, PDF only, 2MB cap (matches the real `uploadResumeSlot` constraint, not JobRight's 10MB/Word claim from the reference scan). Sync modal shows a real diff (`getResumeProfileDiff`) before writing, mapped to 6 sections (Personal/Professional/Education/Certifications/Work Experience/Preferences) — additive by default, never overwrites existing profile content automatically. Education/Work Experience entries that matched an existing profile entry but whose content has drifted (updated responsibilities, end date, field, graduation year) surface as individual `ReplacementCandidate` checkboxes inside that section's diff — struck-through `error`-red current text above `agent`-teal proposed text, default **unchecked**. Only checked entries get passed to `syncResumeToProfile`'s new `replaceKeys` param and actually overwritten; everything else stays additive-only.

**Mobile-responsive fix (2026-08-13, Phase 11) — the reference pattern for any list/table in this codebase going forward.** The list used to be a single `<table min-w-[640px]>` in an `overflow-x-auto` wrapper — on any phone-width screen this forced horizontal scrolling just to reach the row-actions menu, caught live by the user, not in review (see `ui-rules.md`'s new "Mobile / Responsive" section). Fixed with two real, parallel layouts sharing all the same data and actions: the `<table>` is now `hidden sm:block`, and a new `sm:hidden` stacked `ResumeCard` list renders the identical fields (name, target role, status pill, last-modified, primary star) plus the same actions menu below `sm`. Both layouts mount simultaneously in the DOM (one CSS-hidden at any given width, not conditionally rendered) — the shared `menuState` driving which row's actions menu is open needed a `view: "mobile" | "desktop"` tag as a result, since an untagged open-row-id would satisfy both layouts' render checks at once and mount two overlapping menu portals for the same row.

### ResumeAnalysisView (grade + 10-dimension matrix + per-bullet drill-down)

File: components/profile/ResumeAnalysisView.tsx, app/resume/[id]/page.tsx
Last updated: 2026-08-05 (new)

**Pattern notes:**
Per-résumé détail page. `GradeBadge` (A-F, tiered color: A/B success, C warning, D/F error) + Urgent/Critical/Optional `IssueCountPill`s at the top, "Re-Analyze" button (credit-gated, `resume_quality_analysis` usage key, 3/day). Below: Analysis Summary, a teal `--color-agent` "Strategic Narrative" callout (AI-generated holistic insight, never amber), a 10-dimension role-fit grid (reuses `JobEvaluationDimension`'s existing shape), an "Interviewer Skepticism" vulnerabilities list (warning-toned, framed as prep material not fix-it issues), and "Flagged Sections" — each opens `BulletDrillDown` (`SectionKey`-addressed, looked up *live* from the parent's `analysis` state every render so a saved fix immediately shrinks the sidebar/counts without needing a page reload or another Re-Analyze credit spent). Header also has Edit Resume Info / Export / Delete, matching the JobRight reference scan's own per-résumé header actions. Both `/resume` and `/resume/[id]` are `export const dynamic = "force-dynamic"` — see `RESUME.md`'s `revalidatePath` gotcha for why that matters here specifically.

### Tabs (width fix)

File: components/ui/Tabs.tsx
Last updated: 2026-08-05 (fix, component itself is from an earlier session)

**Pattern notes:**
The tabpanel wrapper now uses an inline `style={{width:"100%", minWidth:0}}` instead of relying on a Tailwind `w-full` class — the class alone was confirmed live (via computed-width checks across tabs) to not reliably win, letting the panel silently shrink-wrap to whichever tab's content was currently widest. If a similar "this Tailwind width/sizing class doesn't seem to apply" symptom shows up elsewhere in this build, try the inline-style version before assuming the logic itself is wrong.

### ResumeWorkspace (résumé editor — live preview + AI Rewrite/Editor/Style tabs)

File: components/documents/ResumeWorkspace.tsx, app/resume/tailored/[jobId]/page.tsx
Last updated: 2026-08-05 (updated — 3-tab restructure)

**Pattern notes:**
The real build of `context/build-plan.md` §C1 / the `/preview/resume` mockup's `ResumeWorkspace`, since restructured to match a real competitor's own editor the user shared live screenshots of. Two-column shell: left is `ResumeLivePreview` (`@react-pdf/renderer`'s `PDFViewer` wrapping the exact same `ResumePDF` the download uses — genuinely WYSIWYG), right is **3 tabs**: **AI Rewrite** (default — `AIRewriteTab.tsx`, bundles the score gauge/changelog, `RefinementChips`, and `DocumentChatEditor`), Editor, Style. Sections/style live in local state, debounced-saved via `actions/documents.ts` (`saveResumeSections` 900ms, `saveResumeStyle` 500ms — style debounces shorter since it never triggers a rescore). An AI chat revision or regenerate updates this same local state directly via an `onRevised` callback (not `router.refresh()` alone — a Client Component's already-initialized `useState` wouldn't pick up new Server Component props from a refresh anyway).

### AIRewriteTab (score gauge + quality grade + changelog + chips + chat)

File: components/documents/AIRewriteTab.tsx
Last updated: 2026-08-06 (updated — auto-score, quality grade, gap-closing chips)

**Pattern notes:**
Semicircle `ScoreGauge` (0-10, agent-teal stroke — not the reference's rainbow gradient, matches this app's existing "AI scores use `--color-agent`" rule from `ui-tokens.md`'s Match Score Colors section) + "score jumped from X to Y" line + matched/missing-keyword counts, all sourced from real `ScoreJumpResult` data only. Deliberately does **not** show a "see what's changed" bullet list the way the reference does — this app has no edit-history tracking, and fabricating one would misrepresent what actually happened. Auto-triggers once on workspace mount if unscored (`analyzing`/`onAnalyze` lifted to `ResumeWorkspace`, not owned here). Below it, `QualityGradeCard` (own entry below). A "Close the gap" chip row (one per missing keyword, only shown when there are any) sits above the generic "Quick tweaks" `RefinementChips` row — both share `useDocumentChat` via `DocumentChatEditor`.

### ActionPlan (ranked improvement list)

File: components/documents/ActionPlan.tsx
Last updated: 2026-08-06 (new)

**Pattern notes:**
Merges three real signals into one ranked, capped-at-6 list: urgent/critical per-bullet issues from `QualityGradeCard`'s analysis, missing keywords from the fit score, and C/D/F-graded dimensions. Impact badges (`High impact`/`Medium impact`/`Quick win`) are derived from real severity/category, never a fabricated "+N pts" prediction — see `AIRewriteTab`'s comment for why this app avoids invented numbers. Clicking a bullet-issue item calls `onFocusBullet(company, bulletText)` (switches to the Editor tab and highlights that exact bullet, via `EditorTab`'s `FocusTarget` prop); clicking a keyword/dimension item sends a targeted instruction through `useDocumentChat`.

### QualityGradeCard (10-dimension grade, compact)

File: components/documents/QualityGradeCard.tsx
Last updated: 2026-08-06 (new)

**Pattern notes:**
Compact sibling of `ResumeAnalysisView.tsx`'s full-page grade display — same `GRADE_BADGE` color map (A/B agent-teal tones, C neutral, D warning, F error), but condensed: small badge + urgent/critical/optional counts + a 2-column grid of `{dimension, grade}` (no per-dimension note text, no space for it in a side panel) + "Analyzed X ago". Deliberately **not** auto-refreshed on every edit — `resume_quality_analysis` is capped at 3/day (much tighter than the 15/day fit-score check), so this only updates on an explicit refresh click or after a full Regenerate (`ResumeWorkspace`'s `handleRegenerate`, and only then if a grade already existed).

### EditorTab / StyleTab (résumé + cover-letter workspace tabs)

File: components/documents/{EditorTab,StyleTab}.tsx
Last updated: 2026-08-07 (Phase 8, immediate follow-up — Theme/Page size's native `<select>` replaced with a custom portal-based `Dropdown`, 2 real live bugs found+fixed in the process, see progress-tracker.md's top entry); previously 2026-08-06 (3 new templates/3 new themes; `documentType?: "resume"|"cover_letter"` prop, reused as-is by `CoverLetterWorkspace` since the two documents share one `ResumeStyle`, hides the two résumé-only controls — Skills columns, Bullet style — when `"cover_letter"`)

`StyleTab`'s `Dropdown`/`DropdownPanel` (Theme, Page size): trigger button + a portaled, `position:fixed` panel positioned from the trigger's own `getBoundingClientRect()` — NOT a plain `absolute` popup, which gets silently clipped by `Group`'s `overflow-hidden` accordion wrapper. Same proven pattern (down to the mousedown-before-click ordering) as `ResumeManager.tsx`'s row-action menu — reach for this, not a native `<select>` or a plain absolute popup, for any new dropdown inside an accordion/scroll container in this codebase.

**Pattern notes:**
`EditorTab`: per-section rows (Professional Summary/Skills/Work Experience/Education, plus any user-added **custom** sections), drag-to-reorder at the SECTION level via `@dnd-kit` (first real drag-and-drop in this codebase — the `GripVertical` handles elsewhere, e.g. `ProfileForm.tsx`'s education editor, were always decorative-only, no library wired), visibility eye-toggle (hide is soft — stays in the array, "Show X" restores it, no data loss), inline per-type editors reusing `components/ui/FormControls.tsx` primitives. Section headers are inline-renamable (pencil icon → text input, commits on Enter/blur, `ResumeSection.label` for the 4 fixed types or `.title` for custom, resolved via `sectionDisplayLabel()` in `types/resumeEditor.ts`). A new **"+ Add section"** control offers a small preset catalog (Projects/Certifications/Languages/Awards/Volunteer Experience) plus a blank "Custom section" escape hatch — all backed by one generic `CustomEntry` shape (`title`/`subtitle`/`date`/`bullets`), not a bespoke data model per preset (researched pattern from Enhancv/Novoresume).

Certifications is its OWN first-class section type (`certifications`, `CertificationEntry = {name, issuer, date}`), not one of the generic custom presets — seeded from `profile.certifications` (a flat `string[]`) in `lib/resumeSections.ts`, with `CertificationEntryEditor` mirroring `EducationEntryEditor`'s pattern exactly (Name/Issuer/Date, drag/duplicate/remove). It's fully deletable (not just hideable), same as custom sections.

Within a section, entries (jobs, degrees, certifications, custom-section items) reorder via a separate, generic local `SortableList`/`SortableListItem` helper — its own `DndContext` instance per section, with its own smaller `EntryDragHandle`, deliberately never sharing droppable ids with the outer section-level `DndContext` or with any other section's entries (avoids the "accidental parent-section drag" / cross-level-drop pitfalls a research pass into nested-DND flagged). Bullets within an entry get simple ▲/▼ `MoveButtons` instead of a third nested `DndContext` — a deliberate scope/risk call, not an oversight, since bullets already carry a lot of per-row ephemeral state (AI diff cards, instruction inputs, keyboard-shortcut refs). `WorkEntryEditor` now has real editable title/company/start-date/end-date-or-"Present" fields (previously a read-only `"{title} at {company}"` label); Work Experience, Education, and Custom sections all get "Add entry"/duplicate-entry (`Copy` icon)/remove-entry controls — Education entries in particular could not be added *or removed* at all before this pass, only edited in place.

Bullet textareas are borderless at rest (`border-transparent`), gaining `border-border`/`bg-surface` only on hover/focus — a "canvas," not a permanently-chromed form field; delete/AI-action buttons stayed always-visible (not hover-gated) since hiding functional controls behind hover harms discoverability on touch. `Enter` at a bullet's exact end adds a new bullet below and focuses it (Shift+Enter/mid-text Enter still inserts a literal newline); `Backspace` on an empty bullet deletes it and refocuses the previous one's end (`handleBulletKeyDown`/`pendingFocusIndex`, using the file's existing deferred-setState-in-effect pattern) — this keyboard behavior is shared by `WorkEntryEditor` and the new `CustomEntryEditor`. Empty bullets and the summary textarea show placeholder guidance text; each Work Experience bullet shows a live char-count hint (`BulletLengthHint`, ambers under 40 / over 150 chars — a rough one-line-fit proxy, not an ATS rule). Each Work Experience bullet has its own **"Edit with AI"** (opens an inline instruction input) and **"Regenerate"** (one-click) — both call `actions/documents.ts`'s `rewriteResumeBullet` (shares the `bullet_rewrite` feature flag/usage cap with the profile's own single-bullet rewriter, deliberately one quota bucket not two), but **the result no longer overwrites the bullet directly** — it becomes a `pending` suggestion rendered as an inline `BulletDiffCard` (Was/Now, agent-teal on the suggested side per this app's AI-content color rule) with explicit Accept/Try again/Discard, so an AI rewrite can never silently replace approved wording. This exists here rather than as a hover overlay on the live preview (the reference's own pattern) because `PDFViewer` renders a real PDF inside an iframe — there's no DOM to hover or overlay a button on there. `CustomEntryEditor` (new, simpler sibling of `WorkEntryEditor`) deliberately has **no** AI rewrite/diff — `rewriteResumeBullet`'s prompt is tuned for achievement-focused work-experience bullets specifically and doesn't fit e.g. a Languages entry; a generic custom-content AI rewrite is a plausible future add, not built here.

`StyleTab`: controls now grouped into 3 collapsible sections (`Group`, a small local accordion — deliberately not the installed-but-unused `@base-ui/react` collapsible or the scaffolded `components/ui/*` shadcn set, which resolves through a separate off-brand oklch palette, confirmed by reading `app/globals.css`): **Template & theme** (open by default — template picker with structurally-accurate-not-just-decorative thumbnails, theme, page size), **Typography & colors** (collapsed — Small/Medium/Large text-size preset with the 4 raw font-size inputs demoted behind an "Advanced" toggle; accent color as 8 curated swatches + a native-picker "Custom" tile, replacing the bare OS color picker as the primary control), **Layout & spacing** (collapsed — header alignment as icon buttons, hidden entirely when template is `centered` since that template always centers regardless; skills columns as icon glyph-count buttons; bullet style; spacing sliders now with a live numeric readout via `ResumePDF.tsx`'s exported `mapRange`/`SPACING_RANGES`, instead of a bare unlabeled 0-100 value).

### ResumePDF (sections + style, 6 templates, 6 themes)

File: components/documents/ResumePDF.tsx
Last updated: 2026-08-06 (Phase 8, later same day — 3 new templates + 3 new themes, researched via `agy`; `resolveTokens` exported for CoverLetterPDF's reuse)

**Pattern notes:**
Takes `{profile, sections: ResumeSection[], style: ResumeStyle}`, not the old fixed `{profile, generated, theme}`. `mapRange`/`SPACING_RANGES`/`resolveTokens` are all exported, not just used internally — `StyleTab` uses `mapRange`/`SPACING_RANGES` for its slider readouts, `CoverLetterPDF` uses `resolveTokens` to resolve the same accent-override logic against the ResumeStyle it now shares. Every section-title `<Text>` resolves through `sectionDisplayLabel()` (`types/resumeEditor.ts`) instead of a hardcoded string, so a user-renamed header actually renders.

Section types: `summary`/`skills`/`work_experience`/`education` (the 4 original), `certifications` (same simple degree/details layout as Education, joins it+`skills` in `split`'s sidebar), `custom` (reuses Work Experience's jobEntry layout — title/date header, subtitle, bullets — one generic renderer, not a bespoke layout per preset; defaults to the main column in `split`).

**Templates (6):** `structured` (original single column), `centered` (centered header/titles), `split` (two-column — Contact+Skills+Education/Certifications in a ~32% LEFT sidebar, Summary+Work Experience in main), **`timeline`** (new — work-experience entries get a dedicated 20%-width date column instead of a title/dates header row; `renderSection`'s signature changed from a bare `bulletMark` string to the whole `ResumeStyle` object so it can branch on `style.template` for this), **`executive`** (new — mirrors `split` but sidebar on the RIGHT at 65/35 instead of 32/68, and the header is full-width ABOVE the two-column row rather than living inside the sidebar column), **`block`** (new — solid `accentDark` header banner with hardcoded white text via dedicated `block*` style keys, since it sits on the accent color regardless of theme choice; centered, thicker-ruled section titles). `alwaysCentered` (`createStyles`) covers both `centered` and `block` for the header-alignment-knob-is-a-no-op logic StyleTab also reads.

**Themes (6):** `modern`/`classic`/`minimal` (original) plus new `slate` (steel-blue/dark-slate, airy letter-spacing), `editorial` (deep-crimson serif on pure black, heavy rules), `sage` (sea-green/forest, no header rule) — all still restricted to the PDF standard-14 font families (Helvetica/Times-Roman), the ATS-safety constraint never relaxed by any template/theme addition. Page size default is Letter, not A4. Used by all 3 document routes (`/api/resume/generate`, `/api/documents/generate`, `/api/documents/chat`) plus the live preview.

### CoverLetterWorkspace (new — cover letter editor, mirrors ResumeWorkspace)

File: components/documents/CoverLetterWorkspace.tsx, components/documents/CoverLetterLivePreview.tsx, app/cover-letter/tailored/[jobId]/page.tsx
Last updated: 2026-08-06 (Phase 8, later same day — new, researched via `agy` against the existing ResumeWorkspace architecture)

**Pattern notes:**
Same 2-column shell as `ResumeWorkspace` (`CoverLetterLivePreview` — a `PDFViewer` wrapping `CoverLetterPDF`, debounced 400ms, identical pattern to `ResumeLivePreview` — left; tabs right), sized down to a cover letter's much simpler content model: no sections array, just a Salutation string and a letter-body string. **Editor tab**: a Salutation `FormInput` (placeholder shows the computed `"Hiring Team, {company}"` default; empty = use it) above an auto-expanding Body `<textarea>` (height set imperatively via a `ref`+`useEffect` DOM mutation, not `setState` — doesn't trip `react-hooks/set-state-in-effect`) bound directly to the existing `\n\n`-paragraph-split string, no new content data model needed. Below that, `RefinementChips` with cover-letter-specific presets (concise/warmer/opening-hook/closing — distinct from the résumé's bullet-wording presets, researched via `agy`) and `DocumentChatEditor` for free-form revision, both passing `kind="cover_letter"` (previously `RefinementChips` hardcoded `kind="resume"` internally — now a real prop). **Style tab**: `StyleTab` reused as-is with `documentType="cover_letter"`.

State: `letterBody`/`salutation`/`style`, debounce-saved via `saveCoverLetterContent` (900ms, mirrors `saveResumeSections`' plain-DB-update shape — no PDF re-render, matching the résumé side's own standing behavior) and `saveResumeStyle` (500ms, the SAME action/column the résumé workspace already writes to — one shared `applications.resume_style` row per job, not a parallel cover-letter-only style). A chat/chip revision updates local `letterBody` via `onRevised`'s new `letterBody?: string` field on `useDocumentChat`'s exported `RevisedData` type (previously redeclared inline per-file with a shape that had no `letterBody` field at all — now a single shared type).

### CoverLetterPDF (now template/theme-aware, was theme-only)

File: components/documents/CoverLetterPDF.tsx
Last updated: 2026-08-06 (Phase 8, later same day — rewritten to share the résumé's `ResumeStyle` instead of a bare `theme` prop)

**Pattern notes:**
Takes `{profile, company, letterBody, style: ResumeStyle, salutation?}` — was `{profile, company, letterBody, theme?: ResumeTheme}`. 3-way structural branch, not full 6-template parity with `ResumePDF` (a deliberate scope call, not an oversight — a letter's simple content doesn't support 6 meaningfully distinct structures): `split` gets a real left sidebar (Contact + up to 8 skills pulled from the base `profile.skills`, not a tailored résumé's specific edited set — a cover letter isn't tied to one résumé snapshot); `centered`/`block` center the header; `structured`/`timeline`/`executive` keep the original left-aligned block-letter layout. `salutation` (new) overrides the previously-hardcoded `"Hiring Team, {company}"` recipient line — `null`/empty falls back to that computed default, stored in the new `applications.cover_letter_salutation` column.

### ApplicationDocumentsCard (per-job "document tray" — /resume page's list)

File: components/profile/ApplicationDocumentsCard.tsx, app/resume/page.tsx
Last updated: 2026-08-07 (Phase 8, immediate follow-up — user-flagged "make it professional" pass: `window.confirm` replaced with `ConfirmDialog`, pill labels re-styled to visibly read as links; cover-letter pill gained download/delete parity same round. Card itself new 2026-08-06, replaces the deleted `TailoredResumeCard.tsx`, researched via `agy`)

**Pattern notes:**
One card per job application (not per document) — researched pattern from Teal/Huntr: the job is the root entity, documents are attached assets. Header row: `CompanyLogo` (size `md`) + title/company + an `application_status` badge (`Draft`/`Applied`/`Interviewing`/`Offer`/`Rejected` — `bg-X-light`/`text-X-foreground` token pairs, agent-teal for "Interviewing" as the active/in-motion state, not because it's AI content) + `ExternalLink` glyph — the whole header is a `Link` to `/find-jobs/[jobId]` (the job itself), not straight into an editor like the old card did. Below a `border-t` divider, a horizontal "document tray": a résumé pill AND a cover-letter pill, both the same shape — label `Link` to their respective workspace + sibling download/delete actions (siblings, not nested inside the Link — a Link-inside-a-Link is invalid HTML and breaks click targeting; separate `deletingResume`/`deletingCoverLetter` loading state per pill). Pill labels are `text-agent` with a `group-hover:underline` and a hover-revealed `ChevronRight` — user-flagged that plain `text-text-primary` labels didn't read as clickable even though the `Link` was always functionally there; this makes it unmistakable. Delete uses the shared `ConfirmDialog` (own entry above), not `window.confirm`. When no cover letter exists yet for a job, that slot is instead a `border-dashed` "+ Add cover letter" ghost invite, linking to `/find-jobs/[jobId]?generate=cover_letter` — `DocumentGenerator.tsx` (job-details page) reads that param on mount and fires generation automatically rather than making the user find the button themselves (see its own entry below).

### DocumentGenerator (job-details page's generate/view/chat card)

File: components/job-details/DocumentGenerator.tsx
Last updated: 2026-08-07 (Phase 8, immediate follow-up — Edit/View settled as outline buttons after 2 live rounds; researched via `agy`. `?generate=<kind>` deep-link support added the round before)

**Pattern notes:**
Icon+title is a plain, non-interactive heading — an earlier "make the title itself the link" attempt (still only accent-colored on `:hover`) turned out undiscoverable, user couldn't find the way into the editor at all live. Below it, once `hasDocument`: primary `Generate`/`Regenerate` (solid `bg-accent`) + secondary `Edit` (`SquarePen` icon, → `workspaceHref`) + `View` (`Eye` icon, → the raw-PDF download route) as **outline buttons** (`border border-border ... hover:bg-surface`, the exact class recipe `ResumeWorkspace`'s own "Regenerate" button already uses) — plain text links here read as unfinished next to a solid button, researched pattern: primary=solid, secondary=outline, not text links, for a "1 primary + N secondary" action row. `DocumentAction` is ONE shared component instantiated for both `kind="resume"` and `kind="cover_letter"`, so this — and the `DocumentChatEditor` "Refine with AI" box further down, rendered whenever `hasDocument` — apply identically to both cards with no per-kind code. `DocumentAction`'s mount effect reads `?generate=resume|cover_letter` from `window.location.search` (not `useSearchParams()` — avoids needing a Suspense boundary here, same reasoning `Navbar.tsx`'s `openSettings` already established) and, if it matches this instance's `kind` and the document doesn't already exist, scrolls itself into view and calls `handleGenerate()` automatically — deferred via `setTimeout(0)`, this project's standard fix for `react-hooks/set-state-in-effect`. Strips the param via `router.replace` afterward so a refresh or back-navigation can't re-trigger generation. `ApplicationDocumentsCard.tsx`'s "+ Add cover letter" ghost slot is the current producer of this deep link.

### DocumentSwitcher (new — cross-links the two per-job workspaces)

File: components/documents/DocumentSwitcher.tsx
Last updated: 2026-08-06 (Phase 8, later same day — new, researched via `agy`)

**Pattern notes:**
A small "Résumé / Cover Letter" pill toggle (`bg-accent-muted text-accent` active state, matches `ResumeWorkspace`'s own tab-pill pattern), rendered in both workspace pages' headers. Deliberately not a top-level nav item — `agy` research: unlike `/resume` (a real standalone multi-résumé manager), a cover letter only ever exists in relation to one job, so there's no natural non-job-scoped landing page for a bare nav link; real job-tracker products (Teal, Huntr) keep this scoped to the job/application context. If the target document hasn't been generated yet for this job, its own page's existing redirect-to-job-details guard handles that — `DocumentSwitcher` doesn't need to precompute document existence.

### Programmatic SEO hub + entry pages (public, no auth) — Interview Questions & Salary Insights

Files: `lib/interviewSeo.ts`, `app/interview-questions/page.tsx`, `app/interview-questions/[slug]/page.tsx` (Phase 33, 2026-08-29); `lib/salaryInsightsSeo.ts`, `app/salary-insights/page.tsx`, `app/salary-insights/[slug]/page.tsx` (Phase 34, 2026-08-30)
Last updated: 2026-08-30 (Phase 34) — first entry for either page in this registry; both had shipped without one, same gap as their missing `sitemap.ts` rows fixed the same session.

**Pattern notes:**
Both are the same shape: a `lib/xSeo.ts` with an admin-client `fetchAllEntries()`/`fetchAllInsights()` (public SEO content, no RLS SELECT policy exists or is needed on these tables — the admin-client bypass is intentional, same precedent as `lib/admin/geoContent.ts`'s cross-user aggregate), a `list...()` and `get...BySlug()` pair, a hub page (`Navbar`/`Footer`, grid of cards linking to entries) and a `[slug]` page (`generateMetadata` per entry for a unique title/description, `notFound()` for unknown slugs, a signup CTA at the bottom, `revalidate = 3600`). Neither has an on-site nav link — `sitemap.ts` is their only crawl path, so any new page built this way MUST get a row there (`STATIC_ROUTES` entry for the hub + a mapped array for every real entry slug), or it ships invisible to search engines the way both of these initially did.

Where they diverge: Interview Questions renders real cached Q&A (`interview_question_banks`, one row per company+role+seniority a real user generated) and uses `FAQPage` JSON-LD — a genuine schema.org fit for Q&A content. Salary Insights aggregates real employer-posted `jobs.salary` text across many postings into a (role family, location, currency) bucket with a `MIN_SAMPLE_SIZE` gate, and deliberately has NO structured data — nothing in schema.org's vocabulary honestly fits a salary-range aggregate the way `FAQPage` fits Q&A, so none was forced. Both exclude known-bad rows explicitly (a small `EXCLUDED_COMPANIES` set for test data; an implausible-value filter for salary parses) rather than silently including everything scraped.

**A real candidate rejected before building, worth remembering**: `jobs.company_research` (the per-job AI dossier, `CompanyResearchDossier` in `types/index.ts`) looked like the obvious 3rd programmatic-SEO source but failed live verification — it's written per-candidate from their own résumé (real work-history leakage risk) and `company` is often the job board/staffing agency, not the real employer. Don't reach for it here without re-solving both problems first; see progress-tracker.md's Phase 34 entry for the specifics.

### Career News — /news (public, category tabs) + CareerRadar (dashboard widget)

Files: `lib/newsIngestion.ts`, `app/news/page.tsx`, `components/dashboard/CareerRadar.tsx`, `lib/inngest/functions.ts`'s `syncNewsItemsAsync`, `lib/dashboardWidgets.ts`/`CustomizeDashboardModal.tsx` (new `careerRadar` key)
Last updated: 2026-08-30 (Phase 35) — new, direct user request, iterated through 3 real `agy` research passes after user pushback on scope

**Pattern notes:**
Two independent read paths over one `news_items` table, not one feature trying to serve both jobs. `/news` is fully generic — category tabs (`Hiring & Layoffs`, `AI & Future of Work`), no per-user filtering, works logged-out, same public/no-auth precedent as `/interview-questions` and `/salary-insights`. `CareerRadar.tsx` is the personalized half — a real dashboard widget (registered in `DASHBOARD_WIDGET_KEYS`/`WIDGET_LABELS` like every other one, hideable via the existing Customize Dashboard flow, not a hardcoded addition) that exact-matches the user's saved (`is_saved=true`) job companies against `news_items.company_name`, falling back to the latest `Hiring & Layoffs` items with an honest "no saved-company news yet" label so it's never empty for a new user. Both surfaces read the exact same rows; `company_name` is populated by the same Gemini synthesis call that generates every article's summary — no separate personalization pipeline.

**Scope correction during design, worth remembering the shape of**: the first `agy` pass proposed a narrow "saved companies only" widget. User wanted a real browsable destination "like Samsung News," not a buried widget — second pass produced a category-tabbed lineup, but it skewed tech-only (`Tech & Startups`, `AI & Future of Work`). User corrected that Sortie serves ALL professionals — a third pass rebuilt the lineup around universal career drivers (`Hiring & Layoffs` naturally surfaces mining/forestry/manufacturing/sports-org layoffs alongside tech ones, confirmed in real ingested output, not just tech). The final `AI & Future of Work` inclusion over `agy`'s recommended `Business & Economy` was a direct recommendation on top of the research, not something `agy` itself proposed — reasoning: Business & Economy is the least differentiated of the four original candidates (any finance app already has it) and Hiring & Layoffs already captures its real signal more directly, while AI & Future of Work was the user's original ask for this whole feature.

**Real, verified $0 infra cost** — Google News RSS (free), Jina Reader (`fetchViaJinaReader`, reused as-is from `agent/research.ts`, free at this app's volume), Gemini fast-tier per-article synthesis (no cost-rate row exists for Gemini in `ai_cost_rates` at all — already negligible everywhere else it's used). A regex-based RSS `<item>` extractor was used instead of adding a new XML-parser dependency, since Google News RSS's real structure (verified live) is simple and stable enough not to need one.
