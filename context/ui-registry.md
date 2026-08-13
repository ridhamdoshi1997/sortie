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

### QuestionBankPanel (Cached AI Interview Question Bank)

File: components/interview/QuestionBankPanel.tsx, lib/interviewQuestions.ts, actions/interviewQuestions.ts
Route: app/interview/page.tsx (locked=false, editable search), app/find-jobs/[id]/page.tsx (locked=true, pre-filled embed, gated to application_status === "interviewing" alongside InterviewPanel)
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

File: components/missions/MissionsView.tsx, KanbanBoard.tsx, KanbanCard.tsx, KanbanBoardLoader.tsx
Route: app/missions/page.tsx
Last updated: 2026-08-12

**Pattern notes:**
`MissionsView` is the page-level wrapper: a Board/List toggle (`inline-flex ... rounded-full border border-border bg-surface p-1`, active tab `bg-accent text-accent-foreground`) plus, in List mode, `STAGE_ORDER`-driven filter pills (`lib/applicationStatus.ts`). Board mode renders the existing `KanbanBoardLoader` unchanged; List mode reuses `JobResultCard` directly — same component Liked/External/Recommended already use, so a new list view never needs new card markup. `KanbanBoardLoader` MUST stay `next/dynamic(..., {ssr:false})` — `@dnd-kit`'s `DndContext` generates an instance-counter `aria-describedby` id that mismatches between SSR and client hydration otherwise (confirmed live, an explicit `id` prop does not fix it). `KanbanCard`'s drag handle is a small dedicated `GripVertical` button carrying `{...attributes}{...listeners}`, never the whole card — spreading `useSortable`'s `attributes` (which sets `role="button"`) onto a card containing real `<button>`/`<Link>` children produces invalid nested-button HTML whose inner clicks silently never fire (confirmed live, same failure mode `EditorTab.tsx`'s own comment already warns about).

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
Last updated: 2026-08-13 (Phase 11 — restructured from a flat timeline to epoch nesting)

**Pattern notes:**
Replaces the old flat dotted-list timeline (2026-08-11) after research (build-plan.md §E) found a flat equal-weight stream is the wrong shape for career data. `lib/careerTimeline.ts`'s `buildCareerEpochs` groups each `accomplishments` row under the work-experience role whose `[start_date, is_current ? today : end_date]` range contains the accomplishment's own `date` — auto-computed by date containment, deliberately no manual role picker (ambiguous overlaps resolve to the more recent role, checked in reverse-chronological order). An accomplishment whose date falls outside every role's range lands in a separate "Unassigned" section rather than being silently dropped or mis-bucketed. Education stays a flat list (no start/end range to test containment against, just a `graduation_year`) and job-search activity (tracker status changes) stays its own flat section — only work-experience roles get nested accomplishments. `EpochCard` (one per role, collapsible, `ChevronDown` rotate) reuses the same accent-dot item rendering the old flat list had, still user-authored-not-AI accent color per `ui-rules.md`'s Agent Content rule. New `QuickAddBar` — a single text input + Enter/send button, no modal — closes the page's old "no way to add anything from itself" gap flagged in the same research; always dates to today, which naturally nests it under whichever role is `is_current` via the same containment logic every other accomplishment uses. `AddAccomplishmentModal` gained an optional `defaultDate` prop so an epoch's own "Log here" button pre-fills a date inside that specific role's range (current role → today, past role → its end date) so the save naturally re-nests there without needing an explicit role field. Live-verified with real seeded test data (InsForge CLI raw SQL), not just `tsc`/`eslint`.

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
Text-based wordmark, not an image — no new logo asset was generated as part of this rebrand. `public/logo.png` and the homepage hero/features preview images still show the old "JobPilot" branding baked into static screenshots; those are a separate asset-regeneration task, not a code fix. `priority` prop is still accepted for backward compatibility with existing callers but is unused (no `<Image>` left to prioritize). New `variant` prop (`"dark" | "light"`) makes the wordmark theme-aware for use on both light surfaces (footer) and the dark ink navbar chrome — see the Navbar entry below.

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
Last updated: 2026-07-24 (reworked to a single merged tag row + header icon/legend, matching a real JobRight screenshot)

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
Consolidates what used to be split across two components: correctable skill tags (previously a static, non-interactive section in `MatchScore.tsx` — now clickable, moves a skill between matched/missing via `actions/jobs.ts`'s `correctSkillTag`, optimistic update with rollback on failure) and the Required/Preferred lists (previously two of `JobDescription.tsx`'s four bullet sections). Correcting a tag is a data fix only — does not re-run the AI evaluator or change `match_score`. Reuses the exact skill-badge token pair already spec'd elsewhere (`bg-success-lightest`/`text-success-foreground` for matched, `bg-accent-muted`/`text-accent` for missing) rather than inventing new ones. **2026-07-24:** tags were originally split into two labeled sections ("You have" / "Gap skills"); merged into one `flex flex-wrap` row (matched tags first, then gap tags) to match JobRight's actual layout — the check/✕ icon on each tag is now the only thing distinguishing them, plus the header legend restating what the check means.

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
