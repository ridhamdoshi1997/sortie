# Build Plan

## Core Principle

Full page UI built with mock data first — verified visually before any logic is written. Then functionality is built and wired to the UI step by step. Every feature must be visible and testable before moving to the next. No invisible backend phases.

---

## Phase 1 — Foundation

### 01 Homepage

Build the complete homepage UI.

**UI:**

- Navbar — logo, Dashboard, Find Jobs, Profile links, Start for free button
- Hero section — headline, subheadline, Get Started CTA and Find Your First Match CTA
- Dashboard preview screenshot embedded below hero
- Features section — three value props with descriptions
- Testimonial section
- Bottom CTA section
- Footer

**Logic:**

- Get Started and Start for free → /login if not authenticated, /dashboard if authenticated

---

### 02 Auth

InsForge authentication — Google and GitHub OAuth.

**UI:**

- Login page — Google OAuth button, GitHub OAuth button

**Logic:**

- Google OAuth via InsForge
- GitHub OAuth via InsForge
- OAuth callback handler
- Session management
- Middleware protecting /dashboard, /profile, /find-jobs, /find-jobs/[id]
- After login → redirect to /dashboard

---

### 03 PostHog Initialization

Set up PostHog before any events fire. Must be done before any agent features.

**Logic:**

- Create lib/posthog-client.ts — PostHog browser client, initialized with NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST
- Create lib/posthog-server.ts — PostHog server client with flushAt: 1 and flushInterval: 0
- Initialize PostHog in root app layout — wraps entire app
- posthog.identify() called after successful login with user ID
- posthog.reset() called on logout

---

### 04 Database Schema

All InsForge tables and storage bucket created before any data is written.

**Logic:**

- Create `profiles` table with all columns from architecture.md
- Create `agent_runs` table
- Create `jobs` table with all columns including:
  - tailored fields
  - company_research jsonb column
  - source values: 'search' | 'url'
- Create `agent_logs` table
- Create `resumes` storage bucket with authenticated access only
- Row level security policies on all four tables — always filter by user_id

---

## Phase 2 — Profile Page

### 05 Profile Page — Full UI

Build the complete profile page UI with mock data. No save logic yet.

**UI:**

- Profile needs attention banner at top — completion percentage ring, missing field tags highlighted (e.g. PHONE, LOCATION, EDUCATION)
- Resume section — drag and drop upload area, "Click to upload or drag and drop" text, PDF only note, Select Resume button, Generate Resume from Profile button below
- Profile Information form with clearly labeled sections:
  - Personal Info — Full Name, Email (pre-filled, not editable), Phone Number, Location, LinkedIn URL, Portfolio/GitHub, Work Authorization dropdown
  - Professional Info — Current Job Title, Experience Level dropdown, Years of Experience, Skills tag input with Add button, Industries tag input with Add button
  - Work Experience — up to 3 roles, each with Company Name, Job Title, Start Date, End Date, Currently working here checkbox, Key Responsibilities textarea. Add role button.
  - Education — Highest Degree dropdown, Field of Study, Institution Name, Graduation Year
  - Job Preferences — Job Titles Seeking, Remote Preference dropdown, Salary Expectation, Preferred Locations, Cover Letter Tone dropdown
- Save Profile button at bottom

---

### 06 Profile Save Logic

Wire profile form to InsForge DB.

**Logic:**

- Server Action in actions/profile.ts saves all form fields to profiles table
- Resume PDF uploaded to InsForge Storage at resumes/{user_id}/resume.pdf with upsert: true
- resume_pdf_url saved to profiles table after upload
- is_complete set to true when all required fields are filled
- Completion percentage and missing fields calculated and saved
- Form pre-fills with existing data on return visits
- revalidatePath('/profile') called after save

---

### 07 AI Profile Extraction from Resume

Extract from Resume button — GPT-4o reads uploaded PDF and auto-fills profile form fields.

**UI:**

- Extract from Resume button appears after resume is uploaded
- Loading state while processing
- Form fields populate automatically after extraction
- User reviews and edits if needed before saving

**Logic:**

- pdf-parse extracts raw text from uploaded PDF buffer
- If extracted text is empty or too short — return error: "Could not extract text from this PDF. Please try a different file."
- GPT-4o reads extracted text and returns structured JSON matching all profile field names
- Form fields populated with extracted data
- User saves manually after reviewing

---

### 08 Resume PDF Generation from Profile

Generate a clean professional PDF resume from current profile data using GPT-4o.

**Logic:**

- POST /api/resume/generate
- Reads current profile data from profiles table
- GPT-4o generates professional resume content:
  - Professional summary paragraph
  - Polished work experience bullet points
  - Clean professional language throughout
- @react-pdf/renderer renders GPT-4o output into clean single-page PDF using renderToBuffer()
- Buffer uploaded to InsForge Storage at resumes/{user_id}/resume.pdf with upsert: true
- resume_pdf_url updated in profiles table

---

## Phase 3 — Find Jobs Page

### 09 Find Jobs Page — Full UI

Build the complete Find Jobs page UI with mock data. No logic yet.

**UI:**

- Search controls card at top:
  - JOB TITLE label + input with search icon placeholder "Frontend Engineer"
  - LOCATION label + input placeholder "Remote, New York..."
  - Find Jobs button with search icon
  - Success message area below controls — green banner: "Found 8 jobs and saved 4 strong matches."
- Job list section below:
  - Filter bar: text search input "Filter by company or role...", All Matches dropdown, Match Score sort dropdown
  - Jobs table with columns: COMPANY, ROLE, MATCH SCORE (color coded progress bar + percentage), SALARY EST., SOURCE (Search/URL badge), DATE FOUND
  - Pagination — "Showing 1 to 6 of 24 results", Previous, page numbers, Next

---

### 10 Adzuna Job Discovery

Agent calls Adzuna API to find jobs matching user's search criteria, scores them against user profile, saves to DB.

**Logic:**

- POST /api/agent/find receives jobTitle and location from client
- Call Adzuna API:
  - GET https://api.adzuna.com/v1/api/jobs/{country}/search/1
  - params: what={jobTitle}, where={location}, results_per_page=10, app_id, app_key
  - Detect country from location input — default to 'us'
- For each job returned:
  - Extract title, company, location, salary, description snippet, redirect_url
  - GPT-4o scores job against user profile:
    - matchScore — integer 0-100
    - matchReason — one paragraph explanation
    - matchedSkills — skills user has that job requires
    - missingSkills — skills job requires that user lacks
  - Save complete record to jobs table:
    - source: 'search'
    - run_id from agent_runs record
    - All structured fields saved
- Create agent_run record in DB
- After all jobs saved — update agent_run with total count, return success message to frontend

**PostHog events:** `job_search_started`, `job_found`

---

### 11 Filter + Sort + Pagination

Wire filter tabs, sort dropdown, text search, and pagination to real InsForge DB data.

**Logic:**

- All Matches tab — all jobs for current user
- High Match filter — jobs with match_score >= 70
- Low Match filter — jobs with match_score < 70
- Sort by Match Score — order by match_score descending
- Sort by Newest — order by found_at descending
- Sort by Oldest — order by found_at ascending
- Text search — filter by company name or job title (case insensitive)
- Pagination — 20 jobs per page, total count shown

---

## Phase 4 — Job Details Page

### 12 Job Details Page — Full UI

Build the complete job details page UI. Job data from DB is already available from Phase 3 — wire real data for all job info and match sections immediately. Company research section shows empty state only.

**UI:**

- Back to Jobs link
- Job header — company logo placeholder, job title, company name, match score badge with percentage, View Job Post button (links to redirect_url)
- Info cards row — Salary Est., Location, Job Type, Date Found
- AI Match Reasoning section — match reason paragraph from GPT-4o
- Required Skills vs Your Profile — matched skills as green badges, missing skills as red/orange badges
- Job Description section — description content from Adzuna
- Company Research card — empty state with Research Company button. After research: structured dossier with company overview, tech stack, culture, why this role, interview prep
- Apply Now button (links to redirect_url, opens in new tab)

---

# Feature 13 — Company Research Agent (Updated)

Agent researches the company using their public website and builds a structured dossier using a single Browserbase session. Three data sources fused together: company website content, job description from DB, user profile from DB.

**Logic:**

- POST /api/agent/research receives jobId
- Load job data from DB — extract company_name, job description, matched_skills, missing_skills
- Load user profile from DB — skills, experience, work history
- Derive company homepage URL by following the Adzuna redirect with server-side fetch() — no browser needed for this step:
  - fetch(redirect_url, { redirect: "follow" }) follows HTTP redirects natively before the browser opens
  - Use response.url as the real employer job page URL
  - Strip subdomain from response.url hostname (e.g. jobs.stripe.com → stripe.com)
  - Construct homepage URL as https://{rootDomain}
  - If response.url still contains "adzuna.com" or fetch throws — fall back to https://www.{company}.com (company name from DB)
  - If Stagehand gets no meaningful content (oneLiner and productSummary empty) — skip browser research entirely, proceed to GPT-4o synthesis with job description and profile only
- Open single Browserbase session with Stagehand
  **Stagehand homepage extraction:**

```typescript
const homepage = await stagehand.extract({
  instruction:
    "This is a company's homepage. Capture what the company actually does, who it's for, and any concrete signals (funding, customers, scale, mission, recent launches). Then find the internal links most worth visiting to research them as an employer.",
  schema: z.object({
    oneLiner: z.string().describe("What the company does in one sentence"),
    productSummary: z
      .string()
      .describe("What they build/sell and who it's for"),
    signals: z
      .array(z.string())
      .describe("Funding, notable customers, scale, mission, recent news"),
    pageLinks: z
      .array(
        z.object({
          url: z.string(),
          kind: z.enum([
            "about",
            "careers",
            "blog",
            "engineering",
            "product",
            "team",
            "other",
          ]),
        }),
      )
      .describe("Internal links worth visiting"),
  }),
});
```

If oneLiner and productSummary are empty — bail to synthesis with job description and profile only.

**Stagehand sub-page extraction (max 3 pages — prefer about/blog/engineering/product over careers):**

```typescript
const page = await stagehand.extract({
  instruction:
    "Extract substance that helps a candidate understand this company before applying: what they do, their values and how they work, the specific technologies and tools they use, notable projects or customers, and how the team operates. Ignore nav, footers, cookie banners, and generic marketing copy.",
  schema: z.object({
    keyPoints: z.array(z.string()),
    technologies: z
      .array(z.string())
      .describe("Specific languages, frameworks, tools, platforms"),
    valuesOrCulture: z
      .array(z.string())
      .describe("Stated values, working style, team norms"),
    notable: z
      .array(z.string())
      .describe("Customers, funding, scale, projects, awards"),
  }),
});
```

- Close Browserbase session after homepage + max 3 sub-pages
  **GPT-4o synthesis (runs after browser closes):**

System prompt:

```
You are a sharp career strategist preparing a candidate to apply for a specific role.
You are given (a) research collected from the company's own website, (b) the job posting,
and (c) the candidate's profile. Produce a concise, concrete briefing that gives this
specific candidate an edge for this specific role.

Rules:
- Ground every company claim in the provided research or job posting. Never invent
  funding, customers, headcount, or facts. If research was thin, infer carefully from
  the job posting and say what's inferred.
- Be specific to THIS candidate. Connect their actual skills and past work to this
  company's stack, product, and values. No generic advice that would apply to anyone.
- Turn the candidate's missing skills into a strategy: how to frame the gap honestly
  and what adjacent experience to lean on.
- Talking points and questions must reference real things from the research, the kind
  of detail that signals the candidate did their homework.
- Keep every item tight: one or two sentences. No fluff.

Return ONLY valid JSON.
```

User prompt feeds three data sources:

```
COMPANY RESEARCH (from their website): {companyResearch}
JOB POSTING: title, company, description, matched_skills, missing_skills
CANDIDATE PROFILE: current_title, years_experience, experience_level, skills, work_experience
```

Temperature: 0.4

**Dossier shape saved to jobs.company_research jsonb:**

```json
{
  "companyOverview": "string",
  "techStack": ["string"],
  "culture": ["string"],
  "whyThisRole": "string",
  "yourEdge": ["string"],
  "gapsToAddress": ["string"],
  "smartQuestions": ["string"],
  "interviewPrep": ["string"],
  "sources": ["string"]
}
```

- Save complete dossier to jobs.company_research jsonb column
- Always return a dossier — never fail silently. If browser research failed, GPT-4o synthesizes from job description and profile alone.
  **PostHog event:** `company_researched` — { userId, jobId, company }

---

## Job Details UI — Company Research Card (Updated)

The Company Research card on the job details page must render all 9 fields:

- **Company Overview** — paragraph
- **Tech Stack** — tag list
- **Culture** — bullet list
- **Why This Role** — paragraph
- **Your Edge** — bullet list (highlight — specific to this candidate)
- **Gaps to Address** — bullet list (reframed as strategy, not weaknesses)
- **Smart Questions** — bullet list (questions to ask in interview)
- **Interview Prep** — bullet list
- **Sources** — small text, links to pages researched

## Phase 5 — Dashboard

### 14 Dashboard Page — Full UI

Build the complete dashboard UI with mock data.

**UI:**

- Four stat cards: Total Jobs Found, Avg. Match Rate, Companies Researched, Jobs This Week — all showing mock numbers with trend indicators
- Recent Activity card — list of 5 activity entries with colored dots and timestamps
- Company Research Activity— bar chart (mock data, days of week)
- Jobs Found Over Time — line chart (mock data, days of week)
- Match Score Distribution — bar chart (mock data, score ranges 50-60%, 60-70%, 70-80%, 80-90%, 90-100%)
- Incomplete profile banner at top if profile not complete

---

### 15 Stats Bar — Real Data

Wire four stat cards to real InsForge DB data for current user.

**Logic:**

- Total Jobs Found — COUNT of jobs where user_id = current user
- Avg. Match Rate — AVG of match_score across all user jobs
- Companies Researched — COUNT of jobs where company_research IS NOT NULL and user_id = current user
- Jobs This Week — COUNT of jobs found in last 7 days

---

### 16 Recent Activity — Real Data

Wire recent activity list to real InsForge DB data for current user.

**Logic:**

- Query agent_runs table — most recent runs for current user
- Query jobs table — most recent company research entries for current user
- Merge and sort all by created_at descending — take last 5-10 entries
- Format each into human readable string:
  - agent_run completed → "Found X jobs for [jobTitle] — [time ago]"
  - company_research populated → "Researched [company] — [time ago]"
- Color coded dot per entry type — info blue, success green

---

### 17 Analytics Charts — PostHog Data

Wire three dashboard charts to real PostHog event data for current user.

**Logic:**

- Jobs Found Over Time — query PostHog for job_found events where distinctId = current userId, last 30 days, group by day
- Match Score Distribution — query PostHog for job_found events, extract matchScore property, group into ranges: 50-60, 60-70, 70-80, 80-90, 90-100
- Company Research Activity — query PostHog for company_researched events where distinctId = current userId, last 7 days, group by day
- All three charts rendered with recharts
- Empty state shown for each chart when no data exists yet

---

## Feature Count

| Phase                 | Features |
| --------------------- | -------- |
| Phase 1 — Foundation  | 4        |
| Phase 2 — Profile     | 4        |
| Phase 3 — Find Jobs   | 3        |
| Phase 4 — Job Details | 2        |
| Phase 5 — Dashboard   | 4        |
| **v1 Total**          | **17**   |

---

# v2 — Career-Ops Roadmap (rebranded **Sortie**, DRAFT — pending approval)

## Status

**Correction history:** the first draft of this section was based on Gemini's paraphrase of `santifer/career-ops`, not the real project — that version invented a 10-dimension rubric, a runtime model router, and a Kanban board that don't exist in career-ops. Then the actual repo README was fetched directly, correcting the broad strokes (6-block evaluation, ATS portal scanner, negotiation scripts, contact discovery, interview story bank, pipeline dedup). Then you supplied your own real, installed career-ops plugin list, which is the final source of truth used below — it confirmed Tavily *is* real (search-augmented job discovery, posting liveness checks, deep research) and added detail the README didn't have: Apify/Serper/TheirStack/startup-boards as portal providers, and the full ecosystem plugin set (Gmail, LinkedIn-alerts, Notion, Obsidian, DOCX, Markdown, Google Calendar, Outlook).

**Decision (confirmed by you):** port career-ops's real feature set into JobPilot as native web features — one Next.js/InsForge app, browser UI instead of a TUI — plus your own custom additions on top. Not running career-ops's CLI separately. Nothing from JobPilot v1 gets removed; this is additive.

v1 (Phases 1–5) is 16/17 complete — only **17 Analytics Charts** remains. Phase 6 still comes first regardless of which feature set follows: it consolidates the two competing Find Jobs pipelines (documented Adzuna/GPT-4o vs. the ad hoc SerpApi/Inngest/Gemini pipeline from the Gemini debugging session) into one system before anything new is layered on.

**Scope change from v1:** `project-overview.md` lists resume tailoring per job, cover letter generation, and auto-apply-adjacent behavior as explicitly **out of scope**. This roadmap brings those back in scope — a conscious v2 decision, flagged here so it's traceable.

**Resolved:** Deep Research's data source is Tavily (Phase 10) — confirmed by your real plugin list, no longer an open question.

**Your custom feature list has been received and folded into the phases below** (Model Router → new Phase 7, AI Co-Pilot → new Feature 32, Kanban → new Phase 15; Dynamic Scanners/Deep Research/Interview Prep already matched what career-ops's real feature set already covered). See the table in Phase 17 for the full mapping.

**All open items resolved:**

1. **Evaluator shape** — 10 generic A-F dimensions, not tied to career-ops's 6 named blocks. Phase 9 rewritten accordingly.
2. **Portal Scanner build order** — build all of Ashby/Greenhouse/Lever (direct ATS APIs), TheirStack, Apify, Serper, and startup-boards. No single provider deferred.
3. **LinkedIn / Indeed** — explicitly requested, then declined after investigation: SerpApi's Google Jobs results already surface LinkedIn and Indeed as apply sources on most listings (confirmed live — most scraped jobs list them in `apply_options`), so that coverage already exists through a legitimate path. Direct LinkedIn scraping carries real ToS/legal risk (LinkedIn has pursued litigation over scraping, e.g. the hiQ Labs case) and was already explicitly out of scope in v1 for that reason — decision is to not build direct scrapers for either platform.
4. **Portal Scanner's target company list** — starts empty; you add specific companies through the UI as you go, rather than a pre-seeded list.

Nothing left blocking Phase 7 onward.

## Rebrand pass — ✅ done (2026-07-18)

Before Phase 7 started, a full rebrand from "JobPilot" to **"Sortie"** was implemented, per your explicit request to move past a generic purple-SaaS look and give the app real visual identity. Concept mockup was published as a Claude Artifact and approved before implementation. What actually shipped:

- `app/globals.css` — full token repaint (ink/paper surfaces, warm amber "signal" accent replacing purple, new teal "agent" role reserved exclusively for AI-generated content, muted success/info/warning tiers kept distinct from the new accent). Token *names* unchanged, only values — see `context/ui-tokens.md`.
- `app/layout.tsx` — fonts switched from Geist (with an unused dead `Inter` import) to IBM Plex Sans (headings/body) + IBM Plex Mono (scores/timestamps/status), both via `next/font/google`. Page title/description updated.
- `components/layout/Logo.tsx` — image-based "JobPilot" PNG wordmark replaced with a text wordmark (◆ mark + "Sortie"). No new logo asset was generated.
- `components/find-jobs/FindJobsForm.tsx` — fully rebuilt on the token system, replacing the hardcoded slate/blue/green/red Tailwind classes that made this page look like a different app. This was the original, concrete complaint that started the whole GUI conversation.
- New **Agent Content** pattern (`ui-rules.md`) — a left-border teal callout reserved exclusively for AI-generated content, applied to `MatchScore.tsx` and `FindJobsForm.tsx`'s job cards. This is the actual answer to "make it feel like I own it": every time the app shows you something the AI produced, it now looks consistently different from static content, everywhere it's been applied so far.
- `context/ui-tokens.md`, `ui-rules.md`, `ui-registry.md` all updated to match; stale registry entries for the deleted Adzuna-pipeline components removed.
- Verified live in-browser (homepage, login, footer) — tokens, fonts, and wordmark all confirmed rendering correctly, zero console errors. Authenticated pages (Find Jobs, Dashboard, Profile, Job Details) were **not** visually verified live — they require real login I can't perform on your behalf. `MatchScore.tsx`'s change should show up automatically once you view a job with match reasoning.

**Known gaps, not done in this pass:**
- `public/logo.png` and the homepage hero/features static screenshot images still show old "JobPilot" branding baked into the image files — separate asset-regeneration task, not a code fix.
- `CompanyResearch.tsx` (the company research dossier) is also AI-generated content but has not been given the Agent Content treatment yet — apply it next time that component is touched.
- Border radius scale was deliberately left untouched (existing `rounded-2xl`/`rounded-xl` usage across v1 components) — only color and typography changed. Revisit if the "generic SaaS" feel persists after the color/type change settles in.
- No dark-mode toggle exists in the app (the Sortie concept artifact supports both themes, but that was for the mockup only) — this is a separate feature if wanted, not implied by the rebrand.

**Correction — 2026-07-18, same day:** the pass above had actually diverged from the approved concept artifact in three places, caught by direct comparison against the published mockup rather than assumed complete: fonts had been switched to IBM Plex Sans/Mono (mockup uses a system-font stack, with a separate display face reserved for the wordmark/hero only), the wordmark was mixed-case with no "SRT · 01" tag, and the navbar was a plain white bar instead of the mockup's dark ink chrome. Fixed — see `progress-tracker.md`'s "Rebrand correction" entry for the full file list. Colors were re-verified against the mockup's CSS variables at this time too and match exactly (hex-for-hex); only typography and the navbar/wordmark treatment had drifted.

**Addendum — Light/Dark Theme Toggle, 2026-07-18, later same day:** not a career-ops or Phase 6/7 item — an unplanned feature you requested after seeing the corrected rebrand live and finding the "dark chrome only" mockup design (accurate to the artifact, but not what you wanted) too inconsistent against the rest of the still-light app. Resolves the "No dark-mode toggle exists" gap listed above. Full detail, the dark palette table, and a serious pre-existing token-collision bug found and fixed along the way: `progress-tracker.md`'s "Light/dark theme toggle" entry and `ui-tokens.md`'s "Dark Mode" section. Sequenced before Phase 7 at your explicit choice.

---

## Phase 6 — Foundation Consolidation

**Objective:** Finish v1, then merge the two Find Jobs pipelines into one documented system before any new feature is added on top.

**Progress note:** live debugging on the Find Jobs page (before Phase 7+ work started) already covered part of this phase as real bugs surfaced. Status per item below.

### 17 Analytics Charts — PostHog Data *(carried over from v1, unfinished)* — ✅ done, with one deliberate deviation

- **Deviation from spec:** the charts were already querying the `jobs`/`agent_runs` tables directly (real data) instead of PostHog's Insights API — found this while starting the item, not something I changed. Left as-is rather than rebuilding against PostHog: `NEXT_PUBLIC_POSTHOG_KEY` is currently blank in `.env` (PostHog isn't even configured), the DB already has the exact same underlying data with no extra API dependency or latency, and PostHog's query API is nontrivial to wire up for no real benefit here. If you want the charts to genuinely reflect PostHog's event stream (e.g. once PostHog is actually configured and you want cross-device/session analytics semantics, not just DB state), that's a real rebuild, not a tweak — flag it if you want that.
- What was actually missing and is now fixed: none of the three charts had an empty state — a new user with zero data saw a flat zero-value chart instead of a clear "no data yet" message. Added to all three (`components/dashboard/AnalyticsCharts.tsx`).

### 18 Retire the Adzuna Pipeline — ✅ done

- Deleted `app/api/agent/find/route.ts`, `lib/adzuna.ts`, `components/find-jobs/FindJobsClient.tsx`, `SearchControls.tsx`, `JobFilters.tsx`, `JobsPagination.tsx` — confirmed nothing else imported them first.
- Went further than the original list: deleting those left `components/find-jobs/JobsTable.tsx` and `app/api/jobs/route.ts` with zero remaining importers (they were only ever used by `FindJobsClient.tsx`), so deleted those too rather than leaving orphaned code with broken imports behind.
- This resolves the `lib/utils.ts` question from earlier — those two files were the only live consumers of the missing `MATCH_THRESHOLD`/`getMatchScoreColor`/`getMatchScoreTextColor`/`formatSalary` exports. With them gone, `lib/utils.ts`'s current (reduced) content is correct as-is — verified with a full project type-check, zero errors.

### 19 Consolidate the Omni-Scraper — ✅ done

- `lib/actions/scraper.actions.ts` now calls `lib/jobScraper.ts`'s `searchJobs()` instead of maintaining its own duplicate SerpApi fetch loop — one scraping entry point.
- Went further than originally scoped: also fixed real bugs found in the process — SerpApi's `start` offset doesn't paginate Google Jobs (was always fetching the same page; now uses `next_page_token`), added a geographic relevance filter (Google Jobs broadens radius significantly on deeper pages), added Canadian province abbreviation normalization and canonical-location fallback resolution for informal location names (both were causing hard failures).
- Kept the Inngest async evaluation step (`lib/inngest/functions.ts`) — it scales better than the old synchronous batch call, and career-ops's own "Batch Processing" feature (parallel workers) is the same idea.

### 20 Restore `agent_runs` / `agent_logs` Tracking — ✅ done

- `scrapeAndEvaluateJobs()` creates an `agent_runs` row (status `running` → `completed`/`failed`, `jobs_found`) and `evaluateJobsAsync` (Inngest) marks it `completed`/`failed` once evaluation actually finishes — Dashboard "Recent Activity" and stats now reflect real searches.
- Inngest failures write to `agent_logs` in addition to `console.error`.
- **Schema drift found and worked around:** the real `agent_runs` table doesn't match `architecture.md`'s documented columns — no `completed_at`; instead it has `updated_at`, `error_message`, `total_time_ms`, `is_successful`, `search_parameters`, `target_salary`. Code now uses the real columns (`updated_at` for completion time, `error_message`/`is_successful` populated on failure/success, `total_time_ms` tracked). `architecture.md` still describes the old shape — worth reconciling later, not urgent.
- **`agent_logs` table didn't exist in the live database** despite a migration file for it (`migrations/20260603114536_create-agent-logs.sql`) — the CLI's migration ledger was empty even though `agent_runs`/`jobs`/`profiles` clearly existed, meaning those were applied outside the tracked migration system at some point. Created a new tracked migration (`20260718180928_create-agent-logs.sql`) and applied it directly via SQL (the table + RLS + 4 policies), verified with a full simulated lifecycle (create → update → complete → log write).
- **Also found:** an `applications` table already exists (`id, user_id, job_id, generated_resume, generated_cover_letter, custom_form_answers jsonb, ai_model_used, status, created_at`) that isn't referenced anywhere in the current codebase or documented in `architecture.md`. This maps closely to Phase 11's planned `documents` table — worth reusing/extending instead of creating a redundant new table when Phase 11 is built.

### 21 Replace the Ad Hoc Read Path — ✅ done, via a different mechanism than originally scoped

- Originally scoped to switch to the paginated `/api/jobs` route. Instead, fixed via a more direct mechanism once the actual bug was found live: `FindJobsForm.tsx` now polls by the exact job-id list a search returned (`getJobsByIds`) instead of re-matching by title/location text — the text-match approach was silently dropping legitimately relevant results (different phrasing, e.g. "Software Engineer" vs "Software Developer"). The page also now server-loads existing jobs on mount so a refresh or back-navigation doesn't lose your last search.
- `/api/jobs`'s pagination/sort/match-filter capabilities are still not present on this page — worth revisiting if the job list grows large enough that loading up to 100 rows unpaginated becomes a real cost, but not urgent right now.
- Keep polling only until the triggered `agent_run` reaches `completed`/`failed` — not indefinitely.

**PostHog events:** unchanged — `job_search_started`, `job_found`.

---

## Phase 7 — Model Router

**Not a career-ops feature** — career-ops's "model" is whichever CLI agent you run it through. This is your own addition, and it's placed early because Phases 9 (evaluator), 10 (research synthesis), 11 (document generation + AI co-pilot), and 12 (interview prep) all route their AI calls through it rather than hardcoding a provider each.

### 22 Multi-Provider Model Selection

**Logic:**

- `lib/models.ts` — `getModel(provider: "gemini" | "openai" | "anthropic", tier?: "fast" | "smart")` returning a Vercel AI SDK model instance (`ai`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/anthropic`).
- Requires real, separate API keys per provider. `.env` currently has `OPENAI_API_KEY` set to your Gemini key as a compatibility hack for the old GPT-4o-compat pipeline — that hack goes away once this lands; you'll need an actual OpenAI key and a new `ANTHROPIC_API_KEY` for the selector to mean anything for those two options.
- Every AI call site (evaluator, research synthesis, document generation, interview prep, chat co-pilot) takes a `provider` argument instead of a hardcoded SDK client.

### 23 Model Selector UI

**UI:**

- Selector component on the Find Jobs search bar and the job details AI sections (evaluation, research, documents, interview prep all show/use the currently selected provider).
- Persisted per user in a new `profiles.preferred_model` column so it doesn't reset every session.

---

## Phase 8 — Portal Scanner (Omni-Scraper Upgrade)

Confirmed against your actual career-ops plugin list — this is the full real provider roster, not the README's summary. Design principle to preserve: **portal scanning itself is "zero-token"** — structured API calls, no LLM involved. AI only enters at the evaluation step (Phase 9). Keeps scanning cheap and fast regardless of how many companies/boards are configured.

### 24 ATS Provider Adapters (zero-token, direct API)

**Logic:**

- Extend `lib/jobScraper.ts`'s existing `JobScraperProvider` interface with `ashbyProvider`, `greenhouseProvider`, `leverProvider` — each hits that platform's public job-listing API directly for a given company slug. No scraping, no HTML parsing.
- New `target_companies` table (`user_id`, `company_name`, `ats_platform`, `company_slug`) — starts empty; UI lets you add specific companies to scan over time rather than shipping a pre-seeded list.
- **LinkedIn and Indeed are explicitly excluded from direct scraping** — both already surface through Google Jobs/SerpApi results (`apply_options` on most listings), and direct scraping carries real ToS/legal risk that v1's scope already avoided for the same reason.

### 25 Search & Structured-Data Providers

**Logic:**

- `serperProvider` in `lib/jobScraper.ts` is already stubbed (`throw new Error("Serper integration is planned but not yet implemented.")`) — implement it: Serper.dev as a Google Search provider for query-string board scanning.
- `theirstackProvider` — TheirStack API, structured job data across 50,000+ sources with title/country/remote filters. Strong candidate to replace SerpApi as the generic fallback provider entirely (structured data, not scraped search results).
- `apifyProvider` — runs an Apify actor to fetch external job data, mapped into the same normalized job shape. **InsForge already has a native Apify skill** (`webscraper apify connect/login`, scrape → land → schedule) — this is likely the easiest provider to wire up given the existing backend integration.
- `startupBoardsProvider` — YC, Getro, Consider, and similar startup-ecosystem boards.
- Wellfound folds into either the ATS adapters (22) or this group depending on whether it exposes a direct API or needs search-based access — confirm at build time.
- SerpApi (already working today) stays wired as one more provider in the same interface, not replaced outright — no reason to throw away a working integration.

### 26 Custom Query Support

**Logic:**

- Alongside the fixed company list, support ad hoc board queries (career-ops's "19 job board queries") — same title/location inputs already on the Find Jobs page, fanned out across all configured providers in parallel via Inngest.

---

## Phase 9 — 10-Dimension AI Evaluator

**Resolved:** generic 10-dimension A-F rubric, not tied to career-ops's 6 named blocks. Replaces both existing scorers (`lib/evaluator.ts` Gemini 0-100, and the retired `scoreJobsBatch` GPT-4o 0-100).

### 27 Ten-Dimension Scoring

**Logic:**

- New `lib/evaluator.ts` grades each job A-F across 10 fixed dimensions, each with a one-line justification:
  1. Skills/tech match
  2. Seniority/level fit
  3. Compensation fit
  4. Location/remote fit
  5. Domain/industry fit
  6. Growth trajectory
  7. Culture/values signal
  8. Visa/work-authorization fit
  9. Application effort-to-value
  10. Legitimacy (ghost-listing/scam signals — vague comp, generic descriptions, suspiciously broad requirements)
- Rolls up to an overall letter grade and a 1-5 recommendation score (kept alongside the existing `match_score` 0-100 for backward compatibility with current sort/filter UI — `match_score = recommendation * 20`).
- Runs through the Phase 7 model router.
- **Human-in-the-loop threshold**: jobs scoring below 4.0/5.0 overall are visually flagged as "below recommended threshold" — never hidden, never auto-actioned.

**Schema:** new `jobs.evaluation` jsonb (array of `{dimension, grade, note}`, 10 entries) and `jobs.recommendation_score` numeric (1-5).

**UI:** Match Score section on job details gains the 10-dimension breakdown (grade + note per row) plus a legitimacy warning badge when that dimension grades poorly.

---

## Phase 10 — Deep Research Mode

**Resolved:** data source is Tavily — confirmed as an active plugin in your real career-ops setup ("augments ATS API scanning with direct web search for job discovery, liveness checks, and deep company research"). Replaces the open Browserbase-vs-search-API question from the earlier draft.

### 28 Company Research — Candidate Angle

**Logic:**

- Extends the existing `agent/research.ts` dossier (already has company overview, tech stack, culture — see v1 Feature 13) with career-ops's specific additions: **AI/tech strategy signals**, **recent moves** (funding, layoffs, pivots, launches), and a **candidate angle** section — how *this specific candidate* should position themselves given the research.
- Data-gathering step calls Tavily's search/extract API instead of opening a Browserbase/Stagehand session — Browserbase stays unused unless a future feature specifically needs interactive browser control.

**Schema:** extend the existing `jobs.company_research` jsonb shape with `aiStrategy`, `recentMoves`, `candidateAngle` fields rather than replacing it.

### 29 Posting Liveness Checks

**Logic:**

- Tavily also verifies a job posting is still live (not pulled/filled) — same plugin, second use. Ties into Phase 13's pipeline integrity: stale postings get flagged/archived rather than sitting in the active list indefinitely.

---

## Phase 11 — Document Generation Suite

### 30 ATS PDF Resume + Cover Letter Generator

**Logic:**

- Extends the existing `@react-pdf/renderer` pattern (v1 Feature 08 already generates a base resume PDF) to produce a **tailored** resume per job, grounded in profile + job + the Phase 9 evaluation gaps.
- Cover letter generator prompts for career-ops's **four interactive angle choices** before generating (e.g. mission-driven / technical-depth / culture-fit / growth-story — exact wording TBD with you), then produces a keyword-mirrored draft.
- New `documents` table: `id, job_id, user_id, kind ('resume'|'cover_letter'), content_markdown, pdf_url, created_at`.
- Runs through the Phase 7 model router.

**UI:** "Generate Documents" action on job details; angle picker modal before cover letter generation.

### 31 Application Email Drafts

**Logic:**

- Drafts formal recruiter/referral/cold-application emails from the job + profile, with subject line and an attachment checklist.
- **Draft-only — this generates text for you to review and send yourself. No send capability is built, matching career-ops's own explicit design and this app's existing "no auto-apply" invariant.**

### 32 AI Co-Pilot (Chat Editor)

**Not a career-ops feature — your own addition.**

**UI:**

- Vercel AI SDK `useChat` panel next to the rendered resume/cover letter. Highlight a section, type an instruction ("rewrite this to sound more senior"), see the edit streamed back and applied to the markdown in place.

**Logic:**

- `POST /api/documents/chat` — streaming edit endpoint, routed through the Phase 7 model router, operating on the highlighted range plus full document context so edits stay consistent with the rest of the document.
- Edits are saved back to the `documents` row on accept; user can reject/undo before saving.

---

## Phase 12 — Interview Prep & Negotiation

### 33 Interview Story Bank

**Logic:**

- New `profiles.story_bank` jsonb (or a dedicated `interview_stories` table) — 5-10 STAR+Reflection master narratives, built once and reused across every job's interview prep rather than regenerated per job.
- Extraction/refinement flow: AI proposes stories from `profiles.work_experience`, user edits/approves, stories persist.

### 34 Per-Job Interview Prep

**Logic:**

- `POST /api/interview-prep/generate` — combines the job, the Phase 9 evaluation gaps, and Feature 33's story bank into predicted **behavioral** questions + drafted STAR answers pulled from real stored stories, not invented per job.
- **Technical question prediction** (from your custom feature list, career-ops's own STAR+R focus is behavioral-only): a separate pass derives likely **technical** questions from the job's required stack/skills and the Phase 9 evaluation's missing-skills list, so a candidate can prep for gaps specifically, not just rehearse strengths.

### 35 Negotiation Scripts

**Logic:**

- Given an offer (comp entered manually — no email/portal integration), generates salary negotiation talking points: market-rate framing, geographic-discount counters, competing-offer leverage language.
- New `jobs.negotiation_script` text or reuse the `documents` table with `kind: 'negotiation_script'`.

**UI:** new "Interview & Negotiation" tab on job details, alongside Company Research and Match Score.

---

## Phase 13 — Contact Discovery

### 36 Hiring Contact Identification + Outreach Drafts

**Logic:**

- AI-assisted research (reusing the Phase 10 research step, not new scraping) attempts to identify a likely hiring manager/recruiter/peer for the role from public information already gathered.
- Drafts a ≤300-character outreach message per contact type.
- **No LinkedIn scraping or automated sending** — this app's v1 scope already explicitly excludes LinkedIn account connection; Contact Discovery stays within that boundary. Output is names/roles (where findable) + draft text only, for you to send manually.

---

## Phase 14 — Pipeline Integrity & Dashboard Upgrade

career-ops's dedup/health-check feature is directly relevant — it's the same class of bug you already hit (duplicate job rows crashing the React key).

### 37 Dedup & Status Normalization

**Logic:**

- Scheduled or on-demand job (Inngest cron) that merges duplicate `jobs` rows (same `external_id` or same title+company+location fingerprint across providers), normalizes stale/inconsistent status values, and reports a health summary.
- This is the systematic fix behind the manual "delete all rows in the dashboard" cycle from the Gemini debugging session.

### 38 Dashboard Filter/Sort/Group Parity

**Logic + UI:**

- career-ops's TUI has 6 filter tabs, 4 sort modes, and grouped/flat view. Bring the equivalent to the web Find Jobs page: filter tabs by status/recommendation-tier, sort by score/date/company, and a "group by company" toggle — beyond what v1's simple High/Low match filter already does.

---

## Phase 15 — Kanban Tracking Dashboard

**Not a career-ops feature** (career-ops tracks pipeline in its TUI, list-based) **— your own addition.** Depends on Phase 14's `application_status` normalization landing first, so the board has clean data to render.

### 39 Application Lifecycle Schema

**Schema:** `jobs.application_status` text — `draft | applied | interviewing | offered | rejected`, default `draft`. New `actions/jobs.ts` Server Action for status updates (referenced in `architecture.md`'s folder structure but never actually built in v1).

### 40 Kanban Board UI

**UI:**

- New `/pipeline` page (or a Dashboard tab): drag-and-drop columns — Applied, Interviewing, Offered (plus Draft and Rejected) — one card per job.
- Drag triggers the Feature 39 Server Action, optimistic UI update, InsForge write.

**PostHog event:** `application_status_changed` — `{ userId, jobId, from, to }`.

---

## Phase 16 — Ecosystem Ingestion & Export

Grounded in your actual enabled career-ops plugins, not speculation. Each of these is its own trust boundary (mailbox/calendar OAuth, external service writes) — build and ship independently of the core phases above, roughly in the order listed (export-only plugins are lower risk than inbox/calendar ingest, so they come first).

### Export plugins (lower risk — no external read access)

- **Notion export/search** — mirrors the job tracker into a Notion database; can also read Notion records back in as new leads.
- **Obsidian export** — mirrors the tracker into a local Obsidian vault as Markdown files with frontmatter, queryable via Dataview/Bases.
- **DOCX export** — exports a resume/CV to a clean ATS-friendly `.docx`, correctly handling complex sub-roles (fractional/interim engagements).
- **Markdown export** — exports a resume/CV as fully markdownlint-compliant Markdown.

### Ingest plugins (higher risk — OAuth into external inboxes/calendars)

- **Gmail ingest** — read-only OAuth into a specific Gmail label, pulls job leads directly into the pipeline.
- **LinkedIn-alerts ingest** — parses LinkedIn job-alert emails arriving via Gmail, normalizes tracking links into clean job URLs, feeds them into the Portal Scanner queue.
- **Google Calendar ingest** — detects upcoming interview events, surfaces them on the job's timeline.
- **Outlook interview detection** — same idea via Microsoft Graph, extracting company/role/meeting link from interview invitation emails.

Needs its own security review (scopes requested, token storage, revocation flow) before scoping into concrete features — flagged, not detailed, until that review happens.

---

## Phase 17 — Remaining Custom Feature(s) *(placeholder — anything beyond what's below?)*

Your custom feature list came in and is now folded into the phases above rather than sitting separately:

| You asked for | Status |
| --- | --- |
| Dynamic Scanners (SerpApi wired, Serper/Apify-ready) | Already Phase 8 — matches what was already planned from career-ops's real Portal Scanner, confirms the direction |
| Dynamic Model Router (Gemini/GPT-4o/Claude selector) | New Phase 7 — added, this is a genuine JobPilot-original addition, not a career-ops feature |
| Deep Research Agent (Tavily, company news/culture/tech stack) | Already Phase 10 — matches what was already planned, confirms Tavily as the right call |
| AI Evaluator (10-dimension A-F rubric) | Phase 9 — resolved as generic 10-dimension rubric, not tied to career-ops's 6-block naming |
| AI Co-Pilot (Chat Editor) | New Feature 32 in Phase 11 — added |
| Interview Prep Engine (technical questions + STAR answers) | Already Phase 12 — added a technical-question-prediction sub-feature since career-ops's own version is behavioral-only |
| Tracking Dashboard (Kanban: Applied/Interviewing/Offered) | New Phase 15 — added |

Nothing left unaddressed except the Phase 9 rubric conflict. If there's more beyond this list, add it here.

---

## v2 Feature Count

| Phase                                          | Features |
| ----------------------------------------------- | -------- |
| Phase 6 — Foundation Consolidation               | 5        |
| Phase 7 — Model Router                           | 2        |
| Phase 8 — Portal Scanner                         | 3        |
| Phase 9 — 6-Block Evaluator                      | 1        |
| Phase 10 — Deep Research Mode                    | 2        |
| Phase 11 — Document Generation Suite + Co-Pilot  | 3        |
| Phase 12 — Interview Prep & Negotiation          | 3        |
| Phase 13 — Contact Discovery                     | 1        |
| Phase 14 — Pipeline Integrity & Dashboard        | 2        |
| Phase 15 — Kanban Tracking Dashboard             | 2        |
| Phase 16 — Ecosystem Ingestion & Export          | 8 plugins |
| Phase 17 — Remaining Custom Feature(s)           | TBD      |
| **v2 Total (excl. Phase 17)**                    | **24 + 8 plugins** |
