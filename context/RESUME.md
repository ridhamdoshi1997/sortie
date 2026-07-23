# Resume Here

Read this file first, before anything else — including the "Read Before Anything Else" list in `AGENTS.md`. It's the fast-orientation layer; those other docs are the full detail underneath it. Keep this current after any session that changes real state — a stale RESUME.md is worse than none.

Last updated: 2026-07-23

---

## 30-second state

**This session (2026-07-22 → 2026-07-23) was large — full JobRight-parity work on the job details page, several real bugs found via live testing, and a full LinkedIn/Apify integration.** Read `context/progress-tracker.md`'s top entry for full blow-by-blow detail; this is the fast summary.

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

1. Read `context/progress-tracker.md`'s **Current Status** section — top entry is this session's full detail.
2. Read `context/build-plan.md`'s v2 **Status** section and the Master Feature Inventory (§H1 especially — job-detail-page anatomy vs. JobRight) for what's been marked done this session.
3. Run `git status` — confirm the tree matches what this file claims.
4. If the work touches the backend, run `npx @insforge/cli db migrations list` and compare against `migrations/` before assuming `migrations up` will work cleanly — this project's remote migration history is untracked for at least the `profiles` table. This session's pattern (again): apply live via `db query`, verify against `information_schema.columns`, then write the migration file to match — don't run `up --all` blind.
5. **Don't trust `context/architecture.md`'s documented DB schema at face value** — verify a table's real columns with `information_schema.columns` before writing code against it. This session found two more drift cases (`profiles.email`, `jobs.external_id`'s constraint shape) beyond the ones already documented below.
6. **New this session — check Apify actor behavior live before trusting documented input/output schemas.** Every field-name assumption this session that wasn't verified live turned out wrong at least once (Leadership's first field mapping, the email actor's response shape). `AGENTS.md`/this file's existing rule about not trusting `architecture.md` blind now applies to third-party API response shapes too, not just this app's own DB.

---

## Known environment gotchas

- Running `npm run dev` alone is not enough for Find Jobs search to actually score anything — needs a separate `npx inngest-cli@latest dev` process. Without it, jobs get scraped/saved but never evaluated, no error, just permanent `match_score: null`.
- **This session's environment has no way to complete a real Google OAuth login inside the automated browser tool** — every feature this session was verified as deep as possible without one (direct DB round-trips, standalone scripts hitting the real Apify/Jina/Gemini/Wikipedia endpoints with real data, `/preview` mockup rendering checks) but the actual authenticated job-details page click-through is still something you need to do yourself. This has been true all session and across prior sessions — not new, just worth restating since so much shipped this time.
- **New this session:** two Apify actors have their own gates independent of your account balance — `dev_fusion/Linkedin-Profile-Scraper` refuses free-plan API calls entirely (Console-only), and some actors need a one-time manual permission approval in the Apify console before their first API call works (`https://console.apify.com/actors/<id>?approvePermissions=true` — the error response gives you the exact link when this is the blocker).

---

## Where the real detail lives

- `context/build-plan.md` — full v1 (17 features) + v2 (career-ops port + custom, Phases 6-17) roadmap, feature-by-feature spec, and the Master Feature Inventory (§A-L) tracking every feature ever discussed against JobRight.
- `context/progress-tracker.md` — live status, decisions made during the build, notable gotchas per feature. **This session's entry at the top is long — it's the single most complete record of what happened and why.**
- `context/ui-tokens.md` / `ui-rules.md` / `ui-registry.md` — the design system. `ui-registry.md` has new entries this session for `Tabs`, `JobActionBar`, `Qualification`, `InsiderConnections`/`EmailLookupButton`, and the redesigned `NetworkSignals`/`CompanyResearch` (Leadership section).
- Persistent cross-session memory (separate from this repo) — a feedback memory on always verifying fixes live before claiming they work (this session leaned on that harder than any prior one — nearly every fix here was live-verified, several caught real bugs that a code-only review would have missed), and a project-state memory mirroring this file's summary.
