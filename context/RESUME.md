# Resume Here

Read this file first, before anything else — including the "Read Before Anything Else" list in `AGENTS.md`. It's the fast-orientation layer; those other docs are the full detail underneath it. Keep this current after any session that changes real state — a stale RESUME.md is worse than none.

Last updated: 2026-07-19

---

## 30-second state

`job_pilot` — branded **Sortie** in the app itself — is being rebuilt from a JS Mastery tutorial clone into a much bigger personal AI career-ops tool. Across two sessions (2026-07-18 → 2026-07-19): the rebrand was corrected to match the approved concept mockup exactly (system fonts, all-caps wordmark + "SRT · 01" tag, dark ink navbar chrome globally), a light/dark theme toggle was added (`next-themes`), and then a long chain of **real bugs found via actual live testing** got fixed — this is the important part for whoever picks this up next: almost every fix came from the user testing the real app and reporting a specific broken thing, not from code review. Assume more of that pattern exists elsewhere in the app; this codebase's live behavior has repeatedly diverged from what the code "should" do.

**Bugs found and fixed, in order:** (1) a `@theme inline` collision in `globals.css` silently overrode `--color-accent`/`--color-background`/`--color-border`/fonts/radii with shadcn scaffold defaults since the original rebrand. (2) Company Research 500'd ("Failed to load job") because several `jobs` columns were never actually applied to the live table despite a migration file existing for them. (3) `agent/research.ts`'s AI synthesis called OpenAI's real API using `OPENAI_API_KEY`, which was actually the Gemini key under a misleading name — fixed to route through Gemini properly (moot now, see API keys below). (4) The Apply button and "View Job Post" link both silently fell back to `/find-jobs` on a missing link, looking identical to "nothing happens" — now show an honest disabled state. (5) The apply link itself was a Google Jobs search-result redirect, not a real portal link — `lib/jobScraper.ts` now captures SerpApi's `apply_options` and prefers a real employer/ATS link over aggregators, for newly-scraped jobs only. (6) `FindJobsForm.tsx`'s match-score polling replaced the *entire* job list with just the small unscored subset it polled, wiping out already-scored jobs — fixed to merge instead of replace, plus added a missing stop condition. (7) "Back to Jobs" always showed the user's entire saved-job history with a blank form instead of their actual last search, because `jobs.run_id` was never set anywhere in the scrape pipeline — fixed: set on insert, `app/find-jobs/page.tsx` scopes to it and pre-fills the search form, with a same-page fallback to full history for pre-fix jobs. (8) First live test of the Feature 32 chat editor found a stale-PDF bug — the "View" link's URL never changes, so the browser served its own cached copy after a revision; fixed with `Cache-Control: no-store` on the download route, plus added an explicit green confirmation banner in `DocumentChatEditor.tsx` so a successful revision is unambiguous, not just implied by the chat reply text.

**Also shipped, ahead of the numbered roadmap, at the user's direction:** Phase 11 Feature 30 (tailored resume + cover letter generation, `DocumentGenerator.tsx` / `agent/documents.ts` / reuses the `applications` table) and Feature 32 (AI chat revision loop, `DocumentChatEditor.tsx`, conversational not highlight-to-edit, in-memory chat history not persisted). Found and closed a real security gap while building this: `applications` had RLS disabled with zero policies despite existing since the original schema. The generated resume PDF (`ResumePDF.tsx`) was redesigned for a more professional look after the user said the original looked too basic. The Find Jobs job cards were rebuilt to match the approved mockup's card treatment (single-column, tag pills, full-fill Agent Read box) after the user preferred a screenshot of it over the shipped version — this also surfaced and fixed a wrong-token bug in the app-wide Agent Content pattern (`bg-agent-muted` → `bg-agent-light`, affects `MatchScore.tsx` too).

**Verified only via `tsc --noEmit` / `next build` / direct DB queries for most of this — NOT visually confirmed by any session for anything requiring login (job details, Find Jobs card list, Dashboard, Profile).** Feature 30 and Feature 32 have had exactly one real live test each (Feature 32's first test found the stale-PDF bug above, now fixed but not re-verified). Don't assume "it compiles" means "it works" for anything under `app/find-jobs/[id]/` — check `progress-tracker.md` for the specific untested items before building on top of them.

The plan is to port the real feature set of `santifer/career-ops` (a CLI tool — 6-block evaluation, portal scanner, negotiation scripts, contact discovery, interview story bank, pipeline dedup) into this app as native web features, plus custom additions (model router, 10-dimension evaluator, AI co-pilot chat editor, Kanban tracking). Nothing from the original JobPilot v1 gets removed — this is additive.

**Phase 7 (Model Router) is next and now fully unblocked.** All three provider API keys are real and present in `.env`: `GEMINI_API_KEY` (already proven working elsewhere in the codebase), `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` (both added 2026-07-19, replacing `OPENAI_API_KEY`'s old placeholder Gemini-key value — confirmed via grep that nothing in the codebase still depended on that placeholder before it was overwritten). Nothing else is blocking — build `lib/models.ts`'s `getModel(provider, tier)` per `build-plan.md`'s Phase 7 spec, then migrate the existing hardcoded-Gemini call sites (`agent/research.ts`, `agent/documents.ts`, `actions/profile.ts`) to route through it one at a time, verifying each provider actually responds before moving to the next — a key being *present* isn't the same as a key that *works*.

**Repo state:** `origin` is `github.com/ridhamdoshi1997/sortie` (private). Last pushed commit: `c0bfa6e` ("Fix Company Research/Apply link pipeline, ship tailored document generation, fix Find Jobs state bugs") — this includes the `run_id` scoping fix, the apply-link fix, and the card redesign. **Three files are uncommitted as of this handoff:** `app/api/documents/download/route.ts` (cache-control fix), `components/job-details/DocumentChatEditor.tsx` (confirmation banner), `context/progress-tracker.md` (doc updates). Run `git status` to confirm, then ask the user before committing — don't do it silently. `.env` now holds three real, working API keys (Gemini/Anthropic/OpenAI) — it's git-ignored, confirmed, but be extra careful with any command that might touch it.

**Not yet done, worth knowing before touching related work:** `CompanyResearch.tsx` (company dossier) still hasn't gotten the Agent Content treatment. `public/logo.png` and the homepage hero/features screenshot images still show old "JobPilot" branding (static assets, not code). The `Job` type (`types/index.ts`) still declares several fields as required that don't exist in the live table (`cover_letter`, `tailored_resume_url`, `tailored_match_score`, `is_tailored`, `about_company`) — misleading but apparently unused by real code; worth a full type/schema reconciliation pass sometime.

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
