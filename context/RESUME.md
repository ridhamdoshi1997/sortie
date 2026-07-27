# Resume Here

Read this file first, before anything else — including the "Read Before Anything Else" list in `AGENTS.md`. It's the fast-orientation layer; those other docs are the full detail underneath it. Keep this current after any session that changes real state — a stale RESUME.md is worse than none.

Last updated: 2026-07-27

---

## 30-second state (2026-07-24 → 2026-07-27 session)

**This session had two very different halves: (1) fixing a real, previously-latent data-pipeline bug plus a genuinely new feature (Saved Jobs), and (2) a large, iterative "Liquid Glass" visual redesign across the whole app that found several real build-tool/CSS bugs along the way.** Read `context/progress-tracker.md`'s top entries for full detail; this is the fast summary. Full detail on part 2 also lives in `context/ui-tokens.md`'s "Liquid Glass" section — **read that before touching `app/globals.css` again**, it documents three confirmed Lightning CSS bugs that will recur if not read first.

**Part 1 — JD structure + Saved Jobs (shipped, stable, not re-touched since):**

1. **A real bug found and fixed at the root**: `jobs.responsibilities`/`requirements`/`nice_to_have`/`benefits` had never been populated by any code path, ever — confirmed via full-codebase grep. `lib/evaluator.ts` now extracts these plus a cleaned `about_role` summary, `salary` (fallback-only, never overwrites a real scraped value), and a new `hiring_process` field, all riding along on the *same* Gemini call that already grades job fit — zero marginal AI cost per evaluation, not a second call.
2. New DB column `jobs.hiring_process text[]` (migration `20260724010000_add-jobs-hiring-process.sql`, applied live then written to match — this project's remote migration history is still untracked, don't run `migrations up --all` blind).
3. New JD layout: `Responsibilities.tsx`, `HiringProcess.tsx`, `Benefits.tsx` (all new, hide-if-empty) + reworked `Qualification.tsx` (merged single-row skill tags, matches a real JobRight screenshot) + simplified `JobDescription.tsx`.
4. **Backfill in progress, not finished**: `scripts/backfill-job-structure.mjs` re-extracts structure for jobs evaluated *before* this session's fix. As of this note: **449/633** evaluated jobs have structure. Free-tier `gemini-3.1-flash-lite` rate limits (confirmed live: 15 req/min) mean this takes real wall-clock time; the script is idempotent (targets `WHERE match_score IS NOT NULL AND about_role IS NULL`) so it's safe to just re-run `node --env-file=.env scripts/backfill-job-structure.mjs 700` if it's stopped.
5. **Saved Jobs page** (`app/saved-jobs/page.tsx`, new) — the "Saved only" toggle already in `FindJobsForm.tsx` only ever filtered the *current search's* results, not the user's full save history; this new page queries `is_saved = true` unscoped by `run_id`. Extracted `components/shared/JobResultCard.tsx` from `FindJobsForm.tsx`'s inline card JSX, now shared by both.

**Part 2 — Liquid Glass redesign (large, iterative, real bugs found — read `ui-tokens.md` before extending):**

User asked for an Apple Liquid Glass-inspired theme across the whole app. Built as a reusable CSS material system (`.glass-panel`/`.glass-panel-strong`/`.glass-panel-overlay`/`.glass-pill`/`.glass-panel-interactive`, all in `app/globals.css`), applied to every card across job-details/profile/dashboard, the navbar, and Find Jobs. Three real, confirmed build-tool bugs found in the process (full writeups in `ui-tokens.md`):

1. Lightning CSS (Tailwind v4's build) silently drops the standard `backdrop-filter` property if it's written *before* `-webkit-backdrop-filter` in the same declaration block — fixed by always writing the prefix first.
2. A `position: relative` declaration on `.glass-panel-strong` silently overrode `JobActionBar`'s `sticky` Tailwind utility (unlayered CSS beats layered utilities, by this file's own established rule) — combined with a `top-16` offset, this visually overlapped the sticky bar onto the page content below it. Confirmed via a real user screenshot showing the title text overlapped. Fixed by removing `position` from all three glass classes entirely — they must never declare position, since call sites need to set their own.
3. `animation`/`background-size` sharing a declaration block with a `color-mix()`-based `background-image` were silently dropped from the compiled CSS entirely (confirmed via `getComputedStyle(body).animationName === "none"` despite correct source) — fixed by isolating them into their own separate rule.

Also found via a real screenshot: the first ambient-backdrop design (4 radial gradient blobs, warm accent + cool agent-teal mixed in overlapping regions) read as a muddy brown/olive haze in dark mode, worsened by a drift animation sliding the blobs into each other's path over time. Redesigned Apple Music-inspired: 2 blobs in opposite corners, much lower alpha in dark mode, and the drift/breathe animations' travel range tightened so the blobs never cross paths.

**Status at session end: the Apple Music-inspired backdrop simplification was just applied and NOT yet re-verified by the user** (they said "drop it, let's update docs and commit" before seeing the latest version) — this is the one open item from this session. Check with them first thing next session on whether it actually reads better, rather than assuming it's resolved.

**Original session summary below (2026-07-22 → 2026-07-23) — JobRight-parity job details page + LinkedIn/Apify integration.**

**Shipped, in rough order:**

1. **Résumé-fit analysis** (`agent/resumeGap.ts`, `/api/documents/analyze`) — finished a feature left uncommitted from a dropped prior session (missing rate-limit call added).
2. **Two real multi-tenancy/data bugs found and fixed via live testing:**
   - `profiles.email` never existed as a column despite being read everywhere — silently forced the admin account onto Gemini-only/full rate limits since Phase 0 shipped, with no error. Fixed with a migration + backfill + extending the auto-provision trigger.
   - `jobs.external_id` had a **global** unique constraint, but RLS enforces per-user rows — when two accounts' searches surfaced the same real job posting, the whole batch upsert silently failed. Fixed by scoping the constraint to `(user_id, external_id)`.
3. **Job details page restructured into JobRight's Overview/Company tabs** (`components/ui/Tabs.tsx`, new). Shipped every free-tier gap from the JobRight teardown: sticky action bar with Save/Hide (`jobs.is_saved`/`is_hidden`, new `actions/jobs.ts`), correctable skill tags + Required/Preferred split (`Qualification.tsx`, new `correctSkillTag` action), real posting freshness (`jobs.posted_at`, confirmed live that SerpApi actually provides this for free), and a from-scratch honest rewrite of `NetworkSignals.tsx` — dropped JobRight's fabricated "3 former colleagues" headcount claim entirely since there's no free data source for it; replaced with a real "you worked here before" fact plus a (now-fixed) single-company LinkedIn search link.
4. **`agent/research.ts`'s entire browsing layer replaced.** Browserbase/Stagehand was never actually configured (confirmed live) — swapped for Jina Reader (free, no browser to host) + Gemini extraction for both the main company-research dossier and a new Leadership Team lookup (Wikipedia first, site-guessing second, both free; paid Apify LinkedIn search only as a last resort). `@browserbasehq/*` packages removed, `lib/browserbase.ts` deleted.
5. **A systemic extraction bug found and fixed, bigger than it first looked:** the shared `extractStructured()` helper never told Gemini what JSON *shape* to return — only "return valid JSON." Gemini would return correct data in a differently-shaped object (e.g. a bare array instead of `{"leadershipTeam": [...]}`), schema validation silently failed, and it read as "nothing found" even when the model found real data. This hit **every** extraction call, including the main company-research homepage/subpage steps, not just the one place it was first noticed (Leadership) — likely explains any past "browser research came back empty" cases that weren't actually the fetch failing. Fixed everywhere by making each call site spell out its exact expected JSON shape in the prompt.
6. **Full "Insider Connections" + email-reveal feature**, matching a real JobRight screenshot you shared: three real-people buckets (Beyond Your Network / From Your Previous Company / From Your School) via a paid Apify integration (`harvestapi` actors — same vendor as Leadership's fallback), plus per-person email reveal. **Real cost, confirmed live, not estimated:** ~$0.31-0.32 per full connections lookup (3 search calls + company-URL resolves), ~$0.10 per email reveal (reworked mid-build after the originally-planned $0.01/profile tool turned out to be blocked on Apify's free plan for API use — confirmed live via a real 403). The standalone "paste any LinkedIn URL" email box from the JobRight screenshot was **dropped** — the fallback tool is filter-based (search by name+company), not URL-based, so it genuinely can't do that lookup; only reveals email for someone already found via the connections search. Both features are opt-in (button-triggered), gated by new `insider_connections` (3/day) and `email_lookup` (4/day) usage caps, and use a `*LookedUp` boolean pattern (same fix class as item 7 below) so repeat clicks return cached results instead of re-spending.
7. **A UX/cost-safety bug found and fixed on Leadership, then built correctly from the start on Insider Connections:** a successful search that found nothing looked identical to "never searched" (both showed empty state + the button), so users kept re-clicking — and *each* click re-ran the entire paid waterfall including the Apify fallback. Fixed with a `leadershipLookedUp`/`insiderConnectionsLookedUp` flag that distinguishes the two states and short-circuits repeat requests server-side.
8. **Leadership's own latency bug:** 7 guessed page paths were tried sequentially (up to 25s timeout each) — worst case minutes, read as "not working." Fixed to run concurrently (~4s in the real test).
9. **A real, general (not Leadership-specific) bug:** `cleanCompanyName()`'s legal-suffix-stripping regex was unanchored and matched substrings mid-word — "Scotiabank" (contains "co") got truncated to "S", resolving to `www.s.com`. Affects any company name containing "co"/"inc"/"ltd" as a substring (Coinbase, Discovery, Cisco, Costco...), not just Scotiabank. Fixed with a word-boundary-respecting regex.

**Real Apify spend this session:** roughly $0.55-0.65 total across verification calls (all disclosed inline as they happened, several deliberately reused already-known data instead of fresh speculative lookups to minimize cost per your explicit request).

**Not yet done:** the actual Phase 0 launch gate (Privacy Policy/Terms, account deletion, two-account isolation test in-browser, real Vercel deploy) — still 3 items, untouched this session, unchanged from before. A future paid-subscription tier is the stated plan for gating Insider Connections/email lookup once billing exists — not built yet.

**Everything from this session is committed and pushed as of this note** — run `git status`/`git log` to confirm before assuming otherwise; if this line is stale, trust the git commands over this file.

---

## Steps to reorient, in order

1. **First, check with the user whether the Liquid Glass backdrop redesign (Apple Music-inspired, 2-blob) actually looks right** — it was applied and unverified at session end, see the note above.
2. Read `context/ui-tokens.md`'s **Liquid Glass** section in full before touching `app/globals.css` — three confirmed Lightning CSS bugs are documented there with the exact fix pattern; assume a fourth exists somewhere if you add new `color-mix()`-based rules and something silently doesn't apply. Verify via `getComputedStyle()` in the browser, not just by reading source — source-level correctness has not been a reliable signal in this file.
3. Check backfill progress: `npx @insforge/cli db query "SELECT count(*) FILTER (WHERE match_score IS NOT NULL) AS evaluated, count(*) FILTER (WHERE about_role IS NOT NULL) AS has_structure FROM jobs" --json`. If `has_structure` is still well below `evaluated`, the backfill script can just be re-run (it's idempotent, targets only unbackfilled rows) — see `progress-tracker.md` for the exact command.
4. Read `context/progress-tracker.md`'s **Current Status** section — top entries are this session's full detail.
5. Run `git status` — confirm the tree matches what this file claims.
6. If the work touches the backend, run `npx @insforge/cli db migrations list` and compare against `migrations/` before assuming `migrations up` will work cleanly — this project's remote migration history is untracked for at least the `profiles` table. Established pattern: apply live via `db query`, verify against `information_schema.columns`, then write the migration file to match — don't run `up --all` blind.
7. **Don't trust `context/architecture.md`'s documented DB schema at face value** — verify a table's real columns with `information_schema.columns` before writing code against it. Real drift cases found across sessions: `profiles.email`, `jobs.external_id`'s constraint shape, and this session's `jobs.responsibilities`/`requirements`/`nice_to_have`/`benefits`/`hiring_process` (columns existed, nothing had ever written to them).
8. **Check Apify actor behavior live before trusting documented input/output schemas**, and — new this session — **check compiled CSS output (not just source) after any `color-mix()`-based change to `app/globals.css`.** Both are instances of the same underlying lesson: this codebase has repeatedly found that "the code/docs say X" doesn't mean the running system actually does X.

---

## Known environment gotchas

- Running `npm run dev` alone is not enough for Find Jobs search to actually score anything — needs a separate `npx inngest-cli@latest dev` process. Without it, jobs get scraped/saved but never evaluated, no error, just permanent `match_score: null`.
- **No way to complete a real Google OAuth login inside the automated browser tool** — every feature across sessions has been verified as deep as possible without one (direct DB round-trips, standalone scripts hitting real endpoints with real data, `/preview` mockup rendering checks) but the actual authenticated click-through is still something you need to do yourself, and is the main way real UI bugs (the JobActionBar overlap, the muddy dark-mode backdrop) actually got caught this session — via your screenshots, not automated checks.
- Two Apify actors have their own gates independent of your account balance — `dev_fusion/Linkedin-Profile-Scraper` refuses free-plan API calls entirely (Console-only), and some actors need a one-time manual permission approval in the Apify console before their first API call works (`https://console.apify.com/actors/<id>?approvePermissions=true` — the error response gives you the exact link when this is the blocker).
- **New this session:** the free-tier `gemini-3.1-flash-lite` key (used both by `gemini-mcp-tool` and this app's own `lib/evaluator.ts`) is rate-limited to 15 requests/minute — confirmed live from the actual 429 response. Any bulk/backfill script against this key needs real pacing (4.5s+ between calls) and generous backoff on 429/503, or it fails partway through.
- **New this session:** Lightning CSS (Tailwind v4's build tool) has silently dropped valid CSS properties three separate times when they shared a declaration block with a `color-mix()`-based value — see `ui-tokens.md`'s Liquid Glass section for the exact patterns and fixes. Don't assume a CSS change "didn't work" is your logic being wrong before checking the actual compiled output.

---

## Where the real detail lives

- `context/build-plan.md` — full v1 (17 features) + v2 (career-ops port + custom, Phases 6-17) roadmap, feature-by-feature spec, and the Master Feature Inventory (§A-L) tracking every feature ever discussed against JobRight.
- `context/progress-tracker.md` — live status, decisions made during the build, notable gotchas per feature. **The top entries are this session's full detail**, including the complete Liquid Glass bug-hunt blow-by-blow.
- `context/ui-tokens.md` — the design system, **including the new Liquid Glass section** (material recipe, all three confirmed Lightning CSS bugs, the Apple Music-inspired backdrop redesign reasoning). Read this before extending the glass system further.
- `context/ui-registry.md` — component-level class tables. New/updated entries this session: `Qualification`, `Responsibilities`, `Benefits`, `HiringProcess`, `JobResultCard`, Saved Jobs Page.
- Persistent cross-session memory (separate from this repo) — a feedback memory on always verifying fixes live before claiming they work, and a project-state memory mirroring this file's summary.
