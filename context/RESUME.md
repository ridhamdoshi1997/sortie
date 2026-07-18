# Resume Here

Read this file first, before anything else — including the "Read Before Anything Else" list in `AGENTS.md`. It's the fast-orientation layer; those other docs are the full detail underneath it. Keep this current after any session that changes real state — a stale RESUME.md is worse than none.

Last updated: 2026-07-18

---

## 30-second state

`job_pilot` — now branded **Sortie** in the app itself (wordmark, page title, login card) — is being rebuilt from a JS Mastery tutorial clone into a much bigger personal AI career-ops tool. The rebrand is implemented: `app/globals.css` has the new ink/paper/signal-amber/agent-teal token palette, `app/layout.tsx` loads IBM Plex Sans + IBM Plex Mono, `Logo.tsx` is a text wordmark, and a new "Agent Content" UI pattern (teal left-border callout, reserved exclusively for AI-generated content) is applied to `MatchScore.tsx` and `FindJobsForm.tsx`. Verified live in-browser on public pages; authenticated pages weren't visually checked (need real login). Full detail: `build-plan.md`'s "Rebrand pass" note.

The plan is to port the real feature set of `santifer/career-ops` (a CLI tool — 6-block evaluation, portal scanner, negotiation scripts, contact discovery, interview story bank, pipeline dedup) into this app as native web features, plus custom additions (model router, 10-dimension evaluator, AI co-pilot chat editor, Kanban tracking). Nothing from the original JobPilot v1 gets removed — this is additive.

v1 (17 features) is complete. v2 Phase 6 (Foundation Consolidation) is complete. The rebrand pass is complete. Everything is committed and pushed. **Phase 7 (Model Router) is next**, nothing blocking it.

**Repo state:** `origin` no longer points to the original template (`adrianhajdin/job_pilot`) — it was repointed to a new private repo, `github.com/ridhamdoshi1997/sortie`, created this session. Working tree is clean as of the last push (commit `dbffb8d`). `.env` was found to be un-gitignored (never actually committed, but unprotected) and fixed before the first push — `.gitignore` now correctly excludes it. Repo-local `git config user.name`/`user.email` were set to match the GitHub account (noreply email, not a real one) since none existed before.

**Not yet done, worth knowing before touching related work:** `CompanyResearch.tsx` (company dossier) is AI-generated content but hasn't gotten the Agent Content treatment yet. `public/logo.png` and the homepage hero/features screenshot images still show old "JobPilot" branding (static assets, not code). No dark-mode toggle exists.

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
