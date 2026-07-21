# Resume Here

Read this file first, before anything else — including the "Read Before Anything Else" list in `AGENTS.md`. It's the fast-orientation layer; those other docs are the full detail underneath it. Keep this current after any session that changes real state — a stale RESUME.md is worse than none.

Last updated: 2026-07-20

---

## 30-second state

`job_pilot` — branded **Sortie** in the app itself — is being rebuilt from a JS Mastery tutorial clone into a much bigger personal AI career-ops tool. This session shipped **Phase 7 (Model Router)** plus several same-day custom additions (resume/cover-letter theme selection, a custom `Select` component replacing native `<select>` in both selectors — dark-mode contrast fix then a browser-blue-vs-amber-brand-color fix, model version display), then **Phase 9 (10-Dimension AI Evaluator)** pulled ahead of Phase 8 since it builds directly on Phase 7, then two rounds of evaluation-UI redesign the same day. A requested Gemini model swap (`gemini-3.1-pro`) was tested live and rejected — every Gemini pro-family model returns a hard `quota exceeded, limit: 0` on this key's free tier; `MODEL_IDS.gemini` left unchanged. Phase 9 also fixed two real pre-existing bugs: the old evaluator graded every job against a candidate bio **hardcoded in the code** (never the real saved profile), and the new prompt context initially omitted `profile.location`, caught live during verification. The evaluation-UI redesign found and fixed a third real bug (`overallGrade` computed but never persisted) and, more seriously, a reliability bug: richer per-dimension notes caused the model to silently drop 8 of 10 jobs from a full-size batch — not a token-truncation issue, the model just quietly under-delivered — fixed by dropping the Inngest chunk size from 10 to 5. **Everything through this point is committed and pushed** — run `git status` to confirm before assuming otherwise if you're picking this up later. Prior sessions (2026-07-18 → 2026-07-19) fixed a long chain of real bugs found via live testing — rebrand drift correction, dark mode, Company Research 500, Apply-link fixes, Find Jobs state bugs, a stale-PDF caching bug — see `progress-tracker.md` for the full list; this file only carries the current-session summary plus anything still load-bearing from before.

**Phase 7, what shipped (2026-07-19):**
- **`lib/models.ts`** — `getModel(provider, tier)` + `complete(handle, args)`. Architecture decision (asked before building, not silently picked): raw provider clients, not the Vercel AI SDK — an `openai` npm client (baseURL-overridden for Gemini) for `gemini`/`openai`, and the **official `@anthropic-ai/sdk`** for `anthropic`. That split wasn't optional: the project's loaded Claude API skill explicitly requires the official Anthropic SDK for any Claude integration and forbids OpenAI-compatible shims for it — a hard rule that overrode the otherwise-simpler "one raw client shape for all three providers" option.
- **Four call sites migrated** — three from the original plan (`agent/research.ts`, `agent/documents.ts`, `actions/profile.ts`) plus a fourth found mid-work with the identical hardcoded pattern: `app/api/resume/generate/route.tsx` (Feature 08's profile-level resume generator). Every API route now reads `profile.preferred_model` fresh per request, defaulting to `"gemini"` for existing users so nothing changes unless a user actively picks a different provider.
- **New `profiles.preferred_model` column** (nullable `text`, `CHECK`-constrained to `gemini`/`openai`/`anthropic`) — migration file `20260719060900_add-profiles-preferred-model.sql` exists, but was **applied live via `db query`, not `migrations up`** — this project's migration bookkeeping has no remote history at all for the `profiles` table (`db migrations list` returns zero applied migrations despite years of real schema), the same "migration file exists, tracking doesn't know about it" pattern already documented elsewhere in `progress-tracker.md`. Don't expect `migrations up --all` to work cleanly here without investigating that gap first.
- **`components/shared/ModelSelector.tsx`** + `actions/profile.ts`'s `setPreferredModel()` — wired into the job details page (`app/find-jobs/[id]/page.tsx`) once, above Company Research/Document Generator, since both read the same DB column fresh and don't need a duplicate control each.
- **Verified live, not just compiled:** `node --env-file=.env scripts/verify-models.mjs` (kept in the repo, reusable) hit all three real provider keys directly. **Gemini and Anthropic responded correctly. OpenAI's key is valid but rate-limited (HTTP 429, quota/billing not configured on that key)** — flag this to the user, it's an account/billing issue, not a bug. Also ran the actual migrated `generateCoverLetter()` end-to-end against a real profile row for `gemini` and `anthropic`, both producing genuinely tailored output. `tsc --noEmit` and `next build` both clean.

**Deliberate scope cuts from Phase 7, since resolved by Phase 9 — kept here for history:**
- `lib/evaluator.ts` was left unmigrated in Phase 7 since Phase 9 fully replaces it. **Now done** — see the Phase 9 block below.
- The Model Selector was not on the Find Jobs search bar since that scoring path wasn't routed through the model router yet. **That blocking condition is now resolved** (Phase 9 routes `lib/evaluator.ts` through `lib/models.ts`) — a search-bar selector wasn't added since it wasn't explicitly requested, but it's a small, cheap follow-up whenever wanted.
- The `ModelSelector`/`ThemeSelector` UI **has** since been visually confirmed live (see the follow-up work below) — this line is stale, kept for history.

**Phase 9, what shipped (2026-07-20) — 10-Dimension AI Evaluator, pulled ahead of Phase 8 at your request:**
- `lib/evaluator.ts` fully rewritten: grades each job A-F across the 10 spec'd dimensions with a one-line note each, an overall letter grade, and a 1-5 recommendation score, via `lib/models.ts`'s router. `match_score = round(recommendationScore * 20)` preserves the existing 0-100 sort/filter UI.
- **Real bug fixed, found while rewriting:** the old evaluator graded every job against a candidate bio **hardcoded directly in the code**, never the real saved profile — it only ever "worked" because that hardcoded bio happened to match this app's one real user. New dimensions (compensation, visa, location fit) are meaningless without real profile fields the fake bio never had. Fixed by having `lib/inngest/functions.ts` fetch the real `profiles` row and pass it through, using `profile.preferred_model` for provider selection.
- **Second real bug, caught live during verification, not code review:** the new candidate-context builder itself omitted `profile.location`, so every job's Location/remote-fit note said "not specified" regardless of the real value. Fixed and re-verified: a Colombia-residency-required job correctly dropped to a hard F once the model could see the candidate is Toronto-based (previously hedged with partial credit).
- New migration `20260720030000_add-jobs-evaluation-columns.sql` — `jobs.evaluation` jsonb, `jobs.recommendation_score` numeric — applied live, verified via `information_schema.columns`.
- `MatchScore.tsx` gains the 10-dimension breakdown, a legitimacy warning callout (D/F on that dimension), and a "below recommended threshold" callout (`recommendation_score < 4.0`) — additive, existing sections unchanged.
- **Verified live:** ran the real evaluator against the real saved profile and two real scraped jobs for both `gemini` and `anthropic` — grounded, correctly differentiated output both times. UI verified via a temporary route with real captured output plus a synthetic D/F legitimacy case. `tsc --noEmit` and `next build` both clean.
- **Not yet verified end-to-end in-browser** — the function and UI are each independently verified live; a real Find Jobs search actually triggering the full Inngest pipeline hasn't been confirmed (needs a real login plus the separate `inngest-cli dev` process — see the gotcha below).

**Evaluation UI redesign, two rounds (2026-07-20, same day, follow-up to Phase 9):**
- Round 1: replaced the single-column stacked dimension list with new `components/job-details/EvaluationBreakdown.tsx` — responsive card grid, per-dimension icons, a 5-step color-coded grade badge (A=success through F=solid-error, not the old 2-bucket grouping), and an overall-grade + recommendation-score header.
- **Found and fixed:** `overallGrade` was already computed by `lib/evaluator.ts` per spec but silently dropped before reaching the DB. New `jobs.overall_grade` column (migration `20260720050000_add-jobs-overall-grade.sql`, applied live), now persisted in `functions.ts`.
- **A first width-only attempt (the classic `w-screen` full-bleed CSS trick) was wrong and caught before shipping** — screenshot verification showed real scrollbars from the well-known `100vw`-includes-scrollbar-width bug. Fixed structurally instead: split into its own component with a genuinely wider container.
- Round 2: you said the notes were still too thin and asked to widen the *entire* page to match, not just the evaluation section. All narrow-column wrapper `div`s removed from `app/find-jobs/[id]/page.tsx` — every section now shares one `max-w-6xl` width.
- Round 2 also changed `lib/evaluator.ts`'s prompt from "one-line justification" to "substantive 2-3 sentence justification... cite specific concrete detail" per dimension.
- **Serious reliability bug found and fixed via live testing, not part of the original ask:** tested the richer-notes prompt against a real 10-job chunk (the actual production batch size) and found 8 of 10 jobs silently fell back to neutral C-grade placeholders. Root-caused by inspecting the raw model completion directly — NOT token truncation (raising `maxTokens` 6000→24000 changed nothing; the real response was only ~1500 tokens both times). The model was returning valid JSON that just omitted most requested jobs — schema validation can't catch that, only a length check can. Fixed by dropping `lib/inngest/functions.ts`'s chunk size from 10 to 5 (verified 3/3 clean runs at size 5, 2/2 at size 7; size 8 already failed the same way size 10 did — a sharp cliff between 7 and 8). Added a `console.error` when the model under-delivers a batch so this can't silently recur unnoticed again.
- **Verified live** via a temporary route + screenshots and direct calls to `evaluateJobCompatibility` against real DB jobs and the real system prompt. `tsc --noEmit` clean. **Not yet observed through a real Inngest-triggered Find Jobs run** — the chunk-size fix was verified by calling the evaluator function directly, not by watching a live search execute end-to-end.

**Repo state:** Everything through the evaluation-UI redesign is **committed and pushed** to `origin/main` (`github.com/ridhamdoshi1997/sortie`). **Uncommitted since then (2026-07-20): the first public-launch-prep work** — the RLS security gate (migration `20260720120000_enable-rls-profiles-jobs-agent-runs.sql`, applied live + verified) and the paired `lib/inngest/functions.ts` admin-client fix, plus this file's and progress-tracker's updates. Run `git status` to confirm. `.env` still needs the OpenAI key's billing fixed for that provider option to actually work end-to-end; Gemini and Anthropic are both real and working today (Gemini limited to the `flash-lite` family — every pro-tier model is quota-blocked on the free tier, confirmed live).

**Direction pivot (2026-07-20, after the evaluation-UI work):** the project is now aimed at a **minimum-cost public launch** ("Phase 0") ahead of Phase 8 — strategy research produced five published Claude Artifacts (Launch Playbook, Revenue Map, Career OS, Competitive Map, Built to Last; find them via the artifact gallery). North star for all future features: "Sortie is the individual's own, explainable career agent — judgment over speed, for every career state, not just active seekers."

**Phase 0 checklist — 6 of 9 done (2026-07-20), 3 remaining, none of it committed yet:**
- ✅ RLS gate — `profiles`/`jobs`/`agent_runs` had RLS disabled entirely, a real live vulnerability; fixed + verified (see `progress-tracker.md`).
- ✅ Gemini-only cost policy — `lib/access.ts`'s `resolveProvider()`/`isAdminUser()`, an `ADMIN_EMAILS` allowlist. Non-admins always get Gemini, enforced at both write and read time.
- ✅ Per-user daily metering — new `usage_daily` table + `lib/usage.ts`, caps on all 6 real spend points (search/documents/research/resume-import).
- ✅ Signup cap/waitlist — new `profiles.created_at` + `lib/access.ts`'s `isWithinSignupCap()`, wired into `requireUser()`, new `/waitlist` page. `MAX_SIGNUPS` env var (unset = uncapped).
- ✅ Kill switches — new `lib/features.ts`, 4 env flags, default-on, instant-flip-no-redeploy.
- ✅ Rate limiting — new `rate_limit` table + `lib/rateLimit.ts`, 6 req/60s per user per route. Also closes a real race in the metering's read-then-write counter.
- ⬜ Privacy Policy + Terms pages + account deletion — not started.
- ⬜ Two-account multi-tenancy isolation test — not started (the RLS fix mirrors an already-proven pattern, so low risk, but unverified end-to-end).
- ⬜ Actual Vercel Hobby + Inngest deploy — not started; needs your domain/hosting decisions first.

Every item above has a new migration applied live + a real DB-round-trip verification (not just `tsc`), all documented in detail in `progress-tracker.md`'s "Phase 0" entries. **Everything is uncommitted right now** — test it locally first, then let me know when to commit.

**Not yet done, worth knowing before touching related work:** everything previously listed still applies — `CompanyResearch.tsx` still hasn't gotten the Agent Content treatment, `public/logo.png`/hero images still show old "JobPilot" branding, and the `Job` type still declares a few fields the live table doesn't have (`cover_letter`, `tailored_resume_url`, `tailored_match_score`, `is_tailored`, `about_company`).

---

## Steps to reorient, in order

1. Read `context/progress-tracker.md`'s **Current Status** section — last completed item, next item.
2. Read `context/build-plan.md`'s v2 **Status** section (top of the "v2 — Career-Ops Roadmap" heading) — check for any newly-open decisions before starting a phase that depends on one.
3. Run `git status` — a lot of this project's work has been live debugging with uncommitted changes. Don't assume the working tree matches the last commit.
4. If the work touches the backend, run `npx @insforge/cli db migrations list` and compare against `migrations/` before assuming `migrations up` will work cleanly — this project's remote migration history is untracked for at least the `profiles` table (confirmed 2026-07-19: zero applied migrations reported despite years of real schema). When `up` rejects a migration as "not the next pending," verify the target column/table doesn't already exist via `information_schema.columns`, then apply directly with `db query` if so — don't blindly run `up --all` against a live table.
5. **Don't trust `context/architecture.md`'s documented DB schema at face value** — it's drifted from reality in places already found (`agent_runs` has no `completed_at`, has `error_message`/`is_successful`/`total_time_ms` instead; `agent_logs` migration existed but was never applied until a past session created it live). Verify a table's real columns with `npx @insforge/cli db query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='...'" --json` before writing code against it.

---

## Known environment gotcha

Running `npm run dev` alone is not enough for the Find Jobs search to actually score anything. It also needs a separate `npx inngest-cli@latest dev` process running (or the Inngest dashboard at `localhost:8288` won't show runs). Without it, jobs get scraped and saved but silently never evaluated — no error, just permanently `match_score: null`. This has already caused real confusion twice; check for both processes before debugging a "nothing is happening" report.

---

## Where the real detail lives

- `context/build-plan.md` — full v1 (17 features) + v2 (career-ops port + custom, Phases 6-17) roadmap, feature-by-feature spec. Phase 7 and Phase 9 are now marked done there with full detail.
- `context/progress-tracker.md` — live status, decisions made during the build, notable gotchas per feature.
- `context/ui-tokens.md` / `ui-rules.md` / `ui-registry.md` — the pre-existing design system the Sortie rebrand is evolving, not replacing.
- Persistent cross-session memory (separate from this repo, survives even a fresh conversation) — a feedback memory on always verifying fixes live before claiming they work, and a project-state memory mirroring this file's summary.
