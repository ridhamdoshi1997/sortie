# Resume Here

Read this file first, before anything else — including the "Read Before Anything Else" list in `AGENTS.md`. It's the fast-orientation layer; those other docs are the full detail underneath it. Keep this current after any session that changes real state — a stale RESUME.md is worse than none.

Last updated: 2026-07-19

---

## 30-second state

`job_pilot` — branded **Sortie** in the app itself — is being rebuilt from a JS Mastery tutorial clone into a much bigger personal AI career-ops tool. This session shipped **Phase 7 (Model Router)** plus several same-day custom additions beyond the original phase plan: resume/cover-letter theme selection (`ThemeSelector`, three ATS-safe PDF themes), a custom `Select` component replacing the native `<select>` in both selectors (fixed a dark-mode contrast bug, then a browser-blue-vs-amber-brand-color bug), and model version display in `ModelSelector`. A requested Gemini model swap (`gemini-3.1-pro`) was tested live and rejected — every Gemini pro-family model returns a hard `quota exceeded, limit: 0` on this key's free tier, not a transient rate limit; `MODEL_IDS.gemini` was left unchanged rather than shipping a change that breaks Gemini generation. **The working tree is currently NOT clean** — all of the above is uncommitted; run `git status` before assuming otherwise, and confirm with the user before committing. Prior sessions (2026-07-18 → 2026-07-19) fixed a long chain of real bugs found via live testing — rebrand drift correction, dark mode, Company Research 500, Apply-link fixes, Find Jobs state bugs, a stale-PDF caching bug — see `progress-tracker.md` for the full list; this file only carries the current-session summary plus anything still load-bearing from before.

**Phase 7, what shipped (2026-07-19):**
- **`lib/models.ts`** — `getModel(provider, tier)` + `complete(handle, args)`. Architecture decision (asked before building, not silently picked): raw provider clients, not the Vercel AI SDK — an `openai` npm client (baseURL-overridden for Gemini) for `gemini`/`openai`, and the **official `@anthropic-ai/sdk`** for `anthropic`. That split wasn't optional: the project's loaded Claude API skill explicitly requires the official Anthropic SDK for any Claude integration and forbids OpenAI-compatible shims for it — a hard rule that overrode the otherwise-simpler "one raw client shape for all three providers" option.
- **Four call sites migrated** — three from the original plan (`agent/research.ts`, `agent/documents.ts`, `actions/profile.ts`) plus a fourth found mid-work with the identical hardcoded pattern: `app/api/resume/generate/route.tsx` (Feature 08's profile-level resume generator). Every API route now reads `profile.preferred_model` fresh per request, defaulting to `"gemini"` for existing users so nothing changes unless a user actively picks a different provider.
- **New `profiles.preferred_model` column** (nullable `text`, `CHECK`-constrained to `gemini`/`openai`/`anthropic`) — migration file `20260719060900_add-profiles-preferred-model.sql` exists, but was **applied live via `db query`, not `migrations up`** — this project's migration bookkeeping has no remote history at all for the `profiles` table (`db migrations list` returns zero applied migrations despite years of real schema), the same "migration file exists, tracking doesn't know about it" pattern already documented elsewhere in `progress-tracker.md`. Don't expect `migrations up --all` to work cleanly here without investigating that gap first.
- **`components/shared/ModelSelector.tsx`** + `actions/profile.ts`'s `setPreferredModel()` — wired into the job details page (`app/find-jobs/[id]/page.tsx`) once, above Company Research/Document Generator, since both read the same DB column fresh and don't need a duplicate control each.
- **Verified live, not just compiled:** `node --env-file=.env scripts/verify-models.mjs` (kept in the repo, reusable) hit all three real provider keys directly. **Gemini and Anthropic responded correctly. OpenAI's key is valid but rate-limited (HTTP 429, quota/billing not configured on that key)** — flag this to the user, it's an account/billing issue, not a bug. Also ran the actual migrated `generateCoverLetter()` end-to-end against a real profile row for `gemini` and `anthropic`, both producing genuinely tailored output. `tsc --noEmit` and `next build` both clean.

**Deliberate scope cuts this session, flagged not silently assumed:**
- `lib/evaluator.ts` (Find Jobs match-score batch evaluator, still hardcoded to `@google/generative-ai`) was **not** migrated — it's a separate call site, and Phase 9's own spec fully replaces it rather than migrating it in place, so routing it through Phase 7 now would be thrown-away work.
- The Model Selector is **not** on the Find Jobs search bar as Feature 23's spec originally called for, because that search bar's scoring goes through the unmigrated `lib/evaluator.ts` above — a selector there would control a preference with no real effect yet, which conflicts with this codebase's established "no fake UI state" precedent (see the Apply-button fix history). Revisit once Phase 9 ships.
- The new `ModelSelector` UI has **not** been visually confirmed live — same limitation as every other authenticated-page feature in this project: requires a real login this environment can't perform.

**Repo state:** Phase 7 and everything after it this session (theme selection, custom `Select` component, model version display) is real, working, `tsc`-clean code sitting **uncommitted** in the working tree — not yet committed or pushed. Run `git status` to confirm before assuming otherwise, and check with the user before committing/pushing. `.env` now needs the OpenAI key's billing fixed for that provider option to actually work end-to-end; Gemini and Anthropic are both real and working today (Gemini limited to the `flash-lite` family — every pro-tier model is quota-blocked on the free tier, confirmed live).

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

- `context/build-plan.md` — full v1 (17 features) + v2 (career-ops port + custom, Phases 6-17) roadmap, feature-by-feature spec. Phase 7 is now marked done there with full detail.
- `context/progress-tracker.md` — live status, decisions made during the build, notable gotchas per feature.
- `context/ui-tokens.md` / `ui-rules.md` / `ui-registry.md` — the pre-existing design system the Sortie rebrand is evolving, not replacing.
- Persistent cross-session memory (separate from this repo, survives even a fresh conversation) — a feedback memory on always verifying fixes live before claiming they work, and a project-state memory mirroring this file's summary.
