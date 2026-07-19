# Resume Here

Read this file first, before anything else — including the "Read Before Anything Else" list in `AGENTS.md`. It's the fast-orientation layer; those other docs are the full detail underneath it. Keep this current after any session that changes real state — a stale RESUME.md is worse than none.

Last updated: 2026-07-18

---

## 30-second state

`job_pilot` — branded **Sortie** in the app itself — is being rebuilt from a JS Mastery tutorial clone into a much bigger personal AI career-ops tool. In one long session (2026-07-18): the rebrand was corrected to match the approved concept mockup exactly (system fonts, all-caps wordmark + "SRT · 01" tag, dark ink navbar chrome globally), a light/dark theme toggle was added (`next-themes`), and then a long chain of **real bugs found via actual live testing** got fixed — this is the important part for whoever picks this up next: almost every fix this session came from the user testing the real app and reporting a specific broken thing, not from code review. Assume more of that pattern exists elsewhere in the app; this codebase's live behavior has repeatedly diverged from what the code "should" do.

**Bugs found and fixed, in order:** (1) a `@theme inline` collision in `globals.css` silently overrode `--color-accent`/`--color-background`/`--color-border`/fonts/radii with shadcn scaffold defaults since the original rebrand — invisible in light mode, obvious once dark mode existed. (2) Company Research 500'd ("Failed to load job") because `company_research`/`responsibilities`/`requirements`/`nice_to_have`/`benefits` were never actually applied to the live `jobs` table despite a migration file existing for them — classic "migration file exists, live DB diverged" pattern already seen once before with `agent_logs`. (3) `agent/research.ts`'s AI synthesis called OpenAI's real API using `OPENAI_API_KEY` — which is actually the Gemini key under a misleading name — fixed to route through Gemini properly, matching the pattern already used correctly in `actions/profile.ts`. (4) The Apply button and "View Job Post" link both silently fell back to `/find-jobs` when a job had no link, looking identical to "nothing happens" — now show an honest disabled state. (5) The apply link itself was a Google Jobs search-result redirect, not a real portal link — `lib/jobScraper.ts` now captures SerpApi's `apply_options` and prefers a non-aggregator (non-LinkedIn/Indeed/etc.) direct link, only for jobs scraped after this fix. (6) `FindJobsForm.tsx`'s match-score polling replaced the *entire* job list with just the small unscored subset it polled every 3 seconds, wiping out already-scored jobs from view — fixed to merge instead of replace, and to actually stop polling once done (it never had a stop condition). (7) "Back to Jobs" always showed the user's entire saved-job history with a blank search form, because `jobs.run_id` — the column meant to link a job to the search that found it — was never set anywhere in the pipeline; fixed by setting it on insert and scoping the page to the last completed search, with a same-page fallback to full history for pre-fix jobs (existing jobs need one fresh search before this actually kicks in).

**Also shipped, ahead of the numbered roadmap, at the user's direction:** Phase 11 Feature 30 (tailored resume + cover letter generation, `DocumentGenerator.tsx` / `agent/documents.ts` / reuses the `applications` table) and Feature 32 (AI chat revision loop, `DocumentChatEditor.tsx`, conversational not highlight-to-edit, in-memory chat history not persisted). Found and closed a real security gap while building this: `applications` had RLS disabled with zero policies despite existing since the original schema. The generated resume PDF (`ResumePDF.tsx`) was also redesigned for a more professional look (accent-colored section rules, skill chips) after the user said the original looked too basic.

**Verified only via `tsc --noEmit` / `next build` / direct DB queries — NOT visually confirmed by any session, because job details / Find Jobs / Dashboard / Profile all require a real login no session so far could perform.** Feature 30 and Feature 32 in particular have *never* been tested live by anyone. Don't assume "it compiles" means "it works" for anything under `app/find-jobs/[id]/` — check `progress-tracker.md` for the specific untested items before building on top of them.

The plan is to port the real feature set of `santifer/career-ops` (a CLI tool — 6-block evaluation, portal scanner, negotiation scripts, contact discovery, interview story bank, pipeline dedup) into this app as native web features, plus custom additions (model router, 10-dimension evaluator, AI co-pilot chat editor, Kanban tracking). Nothing from the original JobPilot v1 gets removed — this is additive.

**Phase 7 (Model Router) is next per the roadmap, but currently paused, not blocked by code — blocked by missing real API keys.** `OPENAI_API_KEY` is confirmed to actually be the Gemini key under a misleading name; there's no `ANTHROPIC_API_KEY` at all. The user chose to get real keys before Phase 7 starts, and to spend the meantime live-testing Feature 30/32 above instead of having more built underneath them. **Check with the user which happened first (keys arrived, or bugs got reported) before picking a direction.**

**Repo state:** `origin` is `github.com/ridhamdoshi1997/sortie` (private). Last pushed commit: `e86def1` ("Realign rebrand to approved mockup, add light/dark theme toggle, fix token collision bug"). **Everything described above from Company Research fixes onward — all seven live-tested bug fixes, Feature 30, Feature 32, the resume redesign — is uncommitted.** Run `git status` before continuing; there's a lot sitting in the working tree. Ask the user before committing, don't do it silently.

**Not yet done, worth knowing before touching related work:** `CompanyResearch.tsx` (company dossier) still hasn't gotten the Agent Content teal-callout treatment. `public/logo.png` and the homepage hero/features screenshot images still show old "JobPilot" branding (static assets, not code). The `Job` type (`types/index.ts`) still declares several fields as required that don't exist in the live table (`cover_letter`, `tailored_resume_url`, `tailored_match_score`, `is_tailored`, `about_company`) — misleading but apparently unused by real code; worth a full type/schema reconciliation pass sometime.

---

## Steps to reorient, in order

1. Read `context/progress-tracker.md`'s **Current Status** section — last completed item, next item.
2. Read `context/build-plan.md`'s v2 **Status** section (top of the "v2 — Career-Ops Roadmap" heading) — check for any newly-open decisions before starting a phase that depends on one.
3. Run `git status` — a lot of this project's work has been live debugging with uncommitted changes. Don't assume the working tree matches the last commit.
4. If the work touches the backend, run `npx @insforge/cli memory list` (cheap, no AI call) before guessing at schema or infra.
5. **Don't trust `context/architecture.md`'s documented DB schema at face value** — it's drifted from reality in places already found (`agent_runs` has no `completed_at`, has `error_message`/`is_successful`/`total_time_ms` instead; `agent_logs` migration existed but was never applied until this session created it live). Verify a table's real columns with `npx @insforge/cli db query "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='...'" --json` before writing code against it.

---

## Known environment gotcha

Running `npm run dev` alone is not enough for the Find Jobs search to actually score anything. It also needs a separate `npx inngest-cli@latest dev` process running (or the Inngest dashboard at `localhost:8288` won't show runs). Without it, jobs get scraped and saved but silently never evaluated — no error, just permanently `match_score: null`. This has already caused real confusion twice; check for both processes before debugging a "nothing is happening" report.

---

## Where the real detail lives

- `context/build-plan.md` — full v1 (17 features) + v2 (career-ops port + custom, Phases 6-17) roadmap, feature-by-feature spec.
- `context/progress-tracker.md` — live status, decisions made during the build, notable gotchas per feature.
- `context/ui-tokens.md` / `ui-rules.md` / `ui-registry.md` — the pre-existing design system the Sortie rebrand is evolving, not replacing.
- Persistent cross-session memory (separate from this repo, survives even a fresh conversation) — a feedback memory on always verifying fixes live before claiming they work, and a project-state memory mirroring this file's summary.
