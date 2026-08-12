# Build Plan

## Core Principle

Full page UI built with mock data first — verified visually before any logic is written. Then functionality is built and wired to the UI step by step. Every feature must be visible and testable before moving to the next. No invisible backend phases.

---

# START HERE — Session Handoff (2026-07-21)

Read this section first in any new session before touching the phase-by-phase detail below. It's the map; everything after it is the territory.

## The mission, in one sentence

**Sortie is the individual's own, explainable career agent** — it tells you where to aim, what you're worth, and what's next, and it stays with you across every job and every year, not just the three months you're actively hunting. Start consumer, win on judgment over speed, keep the profile useful for the 70% of the workforce who aren't looking today, grow into B2B white-label as the durable revenue. Full reasoning behind each piece of this lives in the five strategy artifacts referenced throughout this doc (Launch Playbook, Revenue Map, Career OS, Competitive Map, Built to Last) — this file is where their conclusions turn into build items.

## Where things stand right now

- **Shipped:** Phases 1–7, 9, 11 (core pipeline, model router, 10-dimension evaluator, document generation), plus Phase 0's cost/security controls (RLS, metering, Gemini-only cost policy, kill switches, rate limiting, signup cap, auto-provisioning trigger) — all committed and pushed to `origin/main` as of this session.
- **Designed but not backed by real data:** everything under `/preview` — resume gap analysis, network signals, onboarding, resume workspace editor, interview bank/settings/notifications. These are real components with dummy props, verified live, ready to wire up.
- **Not yet done:** Phase 0 tasks #33–35 (Privacy Policy/Terms + account deletion, two-account isolation test, actual Vercel deploy) — these gate a real public launch and should be the first thing finished before anything net-new ships.
- **Next planned build:** the résumé gap-analysis backend (tasks #36–38 in the task list) — turns the `/preview` mockup into a real feature.

## The competitive reality: JobRight is the closest thing to us

Across the deep teardown this session (their onboarding, job list, job detail page, résumé editor, interview bank, settings, and auth flow — see §H1, §C1, §C2 below for the full anatomy), JobRight is the single most directly comparable product live today. That's useful: it means most of "what should this look like" is now answered by direct observation, not guesswork.

**Where they're ahead of us today (close the gap, don't skip it):**

| Gap | What to build | Where it's detailed |
| --- | --- | --- |
| No Chrome extension | Capture-first extension ("save → grade → track"), never auto-apply | §G |
| No résumé editor workspace | Score-jump + changelog, one-tap refinement chips, style controls, section editor | §C1 |
| No network/connections feature | ✅ closed 2026-07-22/23 — `NetworkSignals.tsx` (free, real profile-derived fact) *and* `InsiderConnections.tsx` (paid, real Apify/LinkedIn people-search, opt-in, ~$0.31-0.32/lookup) both shipped | §G, §H1 |
| No conversational per-job AI chat | "Ask Orion"-equivalent — reuses the `DocumentChatEditor` chat pattern, pointed at job-fit Q&A | §B |
| Coarser profile schema | Split name/phone/address into ATS-autofill-grade fields; EEO self-ID as a separate, optional step | §C2 |
| No application tracker | Kanban board (Phase 15) | §D |

**Where we're already ahead, or building toward being ahead — this is the part to protect, not copy:**

1. **Judgment over speed.** Their whole category (them included) is racing toward auto-apply — and their own users report it hurts them. We explicitly reject that (§G, "Explicitly rejected"). Every dollar they spend on autofill infrastructure is a dollar we don't need to spend chasing a race we're not in.
2. **10-dimension evaluation depth.** Their match panel is 3 sub-scores (Experience/Skill/Industry %) with no explanation per score. Ours is 10 dimensions, each with a grounded one-line reason, plus an overall letter grade — genuinely more explainable, which is also the direction hiring regulation (EU AI Act) is forcing the whole industry anyway.
3. **Correctable, human-in-the-loop skill tags** (their one feature we most want to copy) is a natural extension of our "human always decides" principle — for us it's not a bolt-on, it's the same design philosophy as the rest of the product.
4. **Model-agnostic router.** They're presumably locked to one model/vendor. Ours already routes across Gemini/OpenAI/Claude — a real hedge against any one provider's price or quality shifting.
5. **The whole Career OS layer — this is the biggest one.** Nothing in JobRight (or any competitor surveyed) addresses the post-hire, passive-70%-of-the-workforce lifecycle: rejection intelligence, offer/negotiation analysis, market-watch for people not actively looking, portable career identity. This is where the real, durable moat is — not in out-featuring them on job-search mechanics, but in being relevant long after (and long before) a job search starts. See §E in full.
6. **Human coaching, deliberately not copied.** Their premium tier is 1-on-1 human recruiter coaching — doesn't scale, expensive to deliver. Ours answers the same three problems ("hearing nothing," "don't know where to aim," "interview coming up") with AI instead of a human, at software margins.

**The one-line strategic summary:** match their table-stakes UI/UX quality (it's genuinely good — clean, calm, functional), but win with the parts of the product that can't be copied by adding a headcount: the evaluation depth, the correctable/explainable AI, the model independence, and the career-long relevance.

## Full feature list — read this instead of asking "what's left"

Every feature discussed anywhere (strategy artifacts, competitor teardown, brainstorms) is tracked in **one place**: the **Master Feature Inventory**, sections **A through L**, later in this file. Don't re-derive a feature list from scratch in a new session — search this file for the feature name first. If it's not there, it hasn't been discussed yet.

Quick index of what's in the inventory, so you know where to look:
- **A** — Job data & coverage (scanning, ATS adapters, freshness, external job import)
- **B** — Evaluation & intelligence (10-dim evaluator, correctable tags, per-job AI chat, comp benchmarking)
- **C, C1, C2** — Documents, résumé workspace anatomy, auth & profile schema
- **D** — Application tracking & rejection intelligence
- **E** — Career identity & post-hire (the Career OS — the biggest differentiator)
- **F** — Interview, offer & negotiation
- **G** — Integrations & plugins (Chrome extension, Gmail, network signals, explicitly-rejected auto-apply)
- **H, H1** — UI/UX, full job-detail-page anatomy vs. JobRight
- **I** — Growth surface & SEO
- **J** — Monetization
- **K** — Trust, safety, legal & ops
- **L** — B2B / white-label

## What to do first in the next session

1. Read this section, then skim the Master Feature Inventory table of contents above — don't re-read the whole file line by line.
2. Check `git status` and `git log` to confirm nothing changed outside this session.
3. Finish Phase 0 (#33–35) before building anything new — it's the gate between "works on my machine" and "safe to show a stranger."
4. Then: résumé gap-analysis backend (#36–38), or the "Previous Company / School" network-signals wiring discussed at the end of this session — both are cheap, both turn an existing `/preview` mockup into something real.

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

Nothing left blocking Phase 8 onward. Phase 7 (Model Router) and Phase 9 (10-Dimension Evaluator) are both done — Phase 9 was pulled ahead of Phase 8 at your request since it directly builds on Phase 7. Phase 8 (Portal Scanner) remains the next unbuilt phase.

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

## Phase 7 — Model Router — ✅ done (2026-07-19)

**Not a career-ops feature** — career-ops's "model" is whichever CLI agent you run it through. This is your own addition, and it's placed early because Phases 9 (evaluator), 10 (research synthesis), 11 (document generation + AI co-pilot), and 12 (interview prep) all route their AI calls through it rather than hardcoding a provider each.

### 22 Multi-Provider Model Selection — ✅ done

**Architecture question resolved (2026-07-19, asked before building, not silently picked):** `lib/models.ts` returns raw provider clients — an `openai` npm client (with a `baseURL` override for Gemini's OpenAI-compat endpoint) for `gemini`/`openai`, and the official `@anthropic-ai/sdk` client for `anthropic` — instead of introducing the Vercel AI SDK. Two reasons: (1) matches the pattern already proven working three times in this codebase, smaller migration diff, no new abstraction layer; (2) the project's loaded Claude API skill explicitly requires the official Anthropic SDK for any Claude integration and forbids OpenAI-compatible shims for it, which would have been a hard conflict with routing Anthropic through the same raw-OpenAI-client shape as the other two providers.

**What shipped:**
- `lib/models.ts` — `getModel(provider: "gemini" | "openai" | "anthropic", tier?: "fast" | "smart")` returns `{ provider, client, model }`; `complete(handle, { systemPrompt, userPrompt, maxTokens, temperature?, jsonResponse? })` normalizes chat completion across the two client shapes (OpenAI-compatible `chat.completions.create` vs. Anthropic's `messages.create`) so call sites never branch on provider. JSON mode is native (`response_format`) for gemini/openai; for Anthropic (no Messages API JSON mode) the instruction is appended to the prompt and markdown code fences are stripped defensively.
- Tier mapping: `gemini` fast=smart=`gemini-3.1-flash-lite` (only model proven working against this project's key — no second tier guessed); `openai` fast=`gpt-4o-mini`/smart=`gpt-4o`; `anthropic` fast=`claude-haiku-4-5`/smart=`claude-sonnet-5` (mirrors the openai mini/full split rather than jumping straight to Opus, since this is a personal-use app where cost matters and a `smart` tier doesn't need the most expensive available model).
- All four hardcoded-Gemini call sites migrated and verified — three named in the original spec (`agent/research.ts`'s dossier synthesis, `agent/documents.ts`'s four resume/cover-letter functions, `actions/profile.ts`'s `extractProfile`) **plus a fourth found during this work**, `app/api/resume/generate/route.tsx` (Feature 08's profile-level resume generator, same hardcoded pattern, not in the original 3-site list). Each API route (`/api/agent/research`, `/api/documents/generate`, `/api/documents/chat`, `/api/resume/generate`) now reads `profile.preferred_model` fresh per request and defaults to `"gemini"` when unset, preserving prior behavior for existing users.
- **Live-verified, not just compiled:** a throwaway `node --env-file=.env scripts/verify-models.mjs` hit all three real provider keys directly — Gemini and Anthropic responded correctly; **OpenAI's key is valid but returned HTTP 429 (quota/billing not set up on that key)** — a billing issue on the user's account, not a code defect, but real until fixed. Additionally ran the actual migrated `generateCoverLetter()` from `agent/documents.ts` (not a reimplementation) against a real profile row for both `gemini` and `anthropic`, producing genuine tailored cover letters end-to-end.
- **Deliberately not migrated:** `lib/evaluator.ts` (the Find Jobs match-score batch evaluator) still calls `@google/generative-ai` directly, hardcoded to Gemini. It's a distinct call site not named in the original 3(+1)-site list, and this spec's own Phase 9 entry says it gets fully replaced (10-dimension evaluator) rather than migrated in place — routing it through the Phase 7 router now would be thrown-away work.

### 23 Model Selector UI — ◐ partial (2026-07-19) — see scope note

**What shipped:** `components/shared/ModelSelector.tsx` (client component, plain `<select>` styled on existing tokens, optimistic update with rollback on failure) + `actions/profile.ts`'s `setPreferredModel()` server action, persisting to `profiles.preferred_model` (new nullable `text` column with a `CHECK` constraint restricting it to the three provider values — migration `20260719060900_add-profiles-preferred-model.sql`, applied live via `db query` since this project's `migrations up` bookkeeping is untracked for the `profiles` table, same pre-existing pattern noted elsewhere in this doc). Wired into the job details page (`app/find-jobs/[id]/page.tsx`) above the Company Research / Document Generator section — since both of those AI actions read `profile.preferred_model` fresh per request, one selector per page is sufficient; it doesn't need to be duplicated per AI card.

**Scope cut, flagged not assumed:** **not** wired into the Find Jobs search bar as the original spec called for. That search bar's match-scoring goes through `lib/evaluator.ts`, which (see Feature 22 above) was deliberately not migrated to the router — wiring a selector there would control a preference that has no real effect yet, which conflicts with this codebase's established honest-UI-state precedent (e.g. the Apply-button/View-Job-Post fixes earlier in this doc). Revisit once Phase 9's evaluator rewrite actually routes through `lib/models.ts`.
**Update (2026-07-20):** Phase 9 shipped — `lib/evaluator.ts` now routes through `lib/models.ts`, so this scope cut's blocking condition is resolved. A `ModelSelector` on the Find Jobs search bar would now control a real preference. Not added yet since it wasn't explicitly requested when Phase 9 was built — a small, cheap follow-up whenever it's wanted.

**Not yet verified live** — same reason as every other authenticated-page feature in this doc: requires a real login this environment can't perform. Ask to be tested: change the selector on a job details page, then trigger Company Research or a document generation/revision and confirm the reply is noticeably different in style between Gemini and Claude.

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

## Phase 9 — 10-Dimension AI Evaluator — ✅ done (2026-07-20)

**Resolved:** generic 10-dimension A-F rubric, not tied to career-ops's 6 named blocks. Replaces both existing scorers (`lib/evaluator.ts` Gemini 0-100, and the retired `scoreJobsBatch` GPT-4o 0-100).

### 27 Ten-Dimension Scoring — ✅ done

**What shipped:**

- `lib/evaluator.ts` fully rewritten. Grades each job A-F across the 10 fixed dimensions (unchanged from spec, listed below), each with a one-line justification, via `lib/models.ts`'s `getModel`/`complete` — the Phase 7 router, as specced:
  1. Skills/tech match
  2. Seniority/level fit
  3. Compensation fit
  4. Location/remote fit
  5. Domain/industry fit
  6. Growth trajectory
  7. Culture/values signal
  8. Visa/work-authorization fit
  9. Application effort-to-value
  10. Legitimacy (ghost-listing/scam signals — vague comp, generic descriptions, suspiciously broad requirements), graded harshly per explicit prompt instruction
- Rolls up to an overall letter grade and a 1-5 recommendation score. `match_score = round(recommendationScore * 20)`, kept for backward compatibility with the existing 0-100 sort/filter UI and `lib/utils.ts`'s `MATCH_THRESHOLD = 70` cutoff.
- **Human-in-the-loop threshold**: jobs scoring below 4.0/5.0 are visually flagged "below recommended threshold" in the UI — never hidden, never auto-actioned, exactly as specced.
- **Real bug fixed during the rewrite, not part of the original spec:** the old evaluator graded every job against a **hardcoded fake candidate bio written directly in the code**, never the user's actual saved profile — it "worked" only because that hardcoded bio happened to describe this app's one real user. Several of the new dimensions (compensation, visa/work-auth, location fit) are meaningless without the candidate's real `salary_expectation`/`work_authorization`/`remote_preference`/`location` fields, which the fake bio never had. Fixed at the root: `lib/inngest/functions.ts`'s `evaluateJobsAsync` now fetches the real `profiles` row for the run's `userId` and passes it through, using `profile.preferred_model` (defaulting to `"gemini"`) to pick the provider — same pattern as every other AI call site since Phase 7.
- **A second real bug found live during verification, fixed same pass:** the candidate-context builder omitted `profile.location` entirely — every job's "Location/remote fit" dimension came back "candidate location is not specified" regardless of the real value. Caught by actually reading the model's own output during live testing, not by code review. Fixed by adding it to the prompt context; re-verified live and the location-mismatch grading changed correctly (a job requiring Colombia residency dropped from a partial-credit grade to a hard F once the model could see the candidate is Toronto-based).
- Zod-validated response schema (`responseSchema`/`jobEvaluationSchema`/`dimensionResultSchema`) with a per-job `fallbackEvaluation()` — a malformed or missing entry for one job in a batch degrades to a neutral C-grade placeholder rather than crashing the whole chunk, consistent with this codebase's established fallback pattern (`agent/research.ts`'s `buildFallbackDossier`).
- **Deliberately not changed:** Inngest chunk size (still 10 jobs per `step.run`) and the 3-second inter-chunk delay — the spec didn't call for changing pipeline shape, only the scoring content, and the existing rate-limit-tuned pacing has no reason to change.

**Schema:** `jobs.evaluation` jsonb (array of `{dimension, grade, note}`, 10 entries) and `jobs.recommendation_score` numeric — migration `20260720030000_add-jobs-evaluation-columns.sql`, applied live via `db query` (same untracked-migrations caveat as every other schema change this project, see Phase 7's entry), verified via `information_schema.columns`.

**UI:** `MatchScore.tsx` gains the 10-dimension breakdown (grade badge + note per row, `A`/`B` in success green, `C` neutral, `D`/`F` in error red) plus a legitimacy warning callout when that dimension grades D/F, and a separate "below recommended threshold" callout when `recommendation_score < 4.0`. Both callouts are additive, not replacements — the existing "Agent read" reasoning and "Required Skills vs Your Profile" sections are unchanged and still render.

**Verified live, not just compiled:** ran the real `evaluateJobCompatibility()` against the real saved profile and two real scraped jobs, once per `gemini` and `anthropic` — both produced correctly differentiated 10-dimension grades grounded in the actual job postings (e.g. correctly flagging an explicit Colombia-residency requirement as a hard location/visa fail, correctly crediting Canada-based postings as a strong match once the location bug above was fixed; Anthropic additionally caught a React-vs-Angular front-end mismatch Gemini's run missed). UI verified separately via a temporary route rendering `MatchScore` with real captured evaluation output, including a synthetic D/F legitimacy case to confirm that specific warning path renders (no real test job happened to grade poorly on legitimacy). `npx tsc --noEmit` and `npm run build` both clean. Temporary verification route, script, and scratch data all removed afterward.

**Not yet verified live in-browser end-to-end** — same login limitation as every other authenticated-page feature in this project. The `evaluateJobCompatibility()` function itself and the `MatchScore` UI are both independently verified live (above); what's not yet confirmed is a real Find Jobs search actually triggering the full Inngest pipeline (`jobs/evaluate` event → `evaluateJobsAsync` → this evaluator → DB write → page render) end-to-end. Ask to be tested: run a new Find Jobs search, wait for scoring to complete (needs the separate `inngest-cli dev` process running — see `RESUME.md`'s known gotcha), then open a job's details page and confirm the 10-dimension breakdown renders with real grades.

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

### 30 ATS PDF Resume + Cover Letter Generator — ✅ done (2026-07-18), shipped ahead of Phase 7/9 with deliberate scope cuts

Built ahead of its numbered place in the roadmap, same as Phase 7 items that jumped the queue earlier — you asked for it directly after Company Research (Feature 13) was fixed, since the two are related (this feature *depends on* Company Research's dossier as its "deep research" input).

**Shipped, differs from the original spec above in three deliberate ways:**

- **Storage:** reuses the existing, previously-unused `applications` table (`generated_resume`, `generated_cover_letter`, new `resume_pdf_url`/`cover_letter_pdf_url` columns) instead of creating a new `documents` table — `applications` already matched this shape almost exactly (flagged in an earlier session, see Phase 6 notes). **Found and fixed in the same pass: `applications` had RLS disabled and zero policies** despite existing since the original schema — closed with the same four-policy pattern every other user-owned table uses, before any real data was written to it.
- **Cover letter:** no angle-picker UI — the model chooses its own angle (mission/technical/culture/growth) based on what `agent/research.ts`'s dossier actually supports, rather than asking the user to pick first. Simpler v1; the angle picker is still a reasonable follow-up if you want more control later.
- **Model:** originally hardcoded to the Gemini-via-OpenAI-compat pattern; **now routed through the Phase 7 model router** (`lib/models.ts`'s `getModel`/`complete`, see Phase 7 above) — `generateTailoredResume`/`generateCoverLetter` take a `provider` argument sourced from `profiles.preferred_model`, defaulting to `"gemini"` when unset.

**Logic (as built):** `agent/documents.ts` — `generateTailoredResume` reuses the exact `GeneratedContent` shape and `ResumePDF.tsx` component from v1 Feature 08, but grounds the prompt in the job posting + company research dossier instead of just the profile, explicitly instructed to mirror real job-posting keywords for ATS matching without fabricating skills. `generateCoverLetter` produces a plain-text letter body rendered via a new `CoverLetterPDF.tsx` (same plain, ATS-safe `@react-pdf/renderer` style as `ResumePDF.tsx`). `POST /api/documents/generate` auto-runs Company Research first if a job hasn't been researched yet, so "Generate" is one click start to finish. `GET /api/documents/download?jobId=&kind=` streams the stored PDF, mirroring the existing `/api/resume/download` pattern.

**UI:** `components/job-details/DocumentGenerator.tsx` — a card on the job details page (between Company Research and the Apply button) with two independent Generate/Regenerate buttons and a "View" link once a document exists, matching `ResumeSection.tsx`'s existing button/transition pattern.

### 31 Application Email Drafts

**Logic:**

- Drafts formal recruiter/referral/cold-application emails from the job + profile, with subject line and an attachment checklist.
- **Draft-only — this generates text for you to review and send yourself. No send capability is built, matching career-ops's own explicit design and this app's existing "no auto-apply" invariant.**

### 32 AI Co-Pilot (Chat Editor) — ✅ done (2026-07-18), shipped as a simpler feedback loop

**Not a career-ops feature — your own addition.** Built ahead of its numbered place immediately after Feature 30 (this is its natural follow-on: refining what Feature 30 generates), same session.

**Shipped, differs from the original spec above in two deliberate ways** (both from an unanswered clarifying question — proceeding on the recommended defaults, flag if this isn't what was wanted):

- **No highlight-to-edit streaming.** A conversational feedback loop instead: type an instruction, the AI revises the *whole* document (grounded in the current content + the instruction + the conversation so far), the stored resume/cover letter and its PDF get replaced. No Vercel AI SDK/`useChat` — plain `fetch` + `useTransition`, matching the rest of this codebase's convention; no streaming needed since a full-document revision isn't token-by-token UX.
- **Chat history is in-memory only**, not persisted — resets if you leave the page. Each revision still overwrites the saved document in `applications` (reusing Feature 30's table decision, not a new `documents` table), so the end result survives; the back-and-forth that produced it doesn't.
- **Model:** originally the same hardcoded pattern as Feature 30; **now routed through the Phase 7 model router** the same way — `reviseTailoredResume`/`reviseCoverLetter` also take a `provider` argument.

**Logic (as built):** `agent/documents.ts` gained `reviseTailoredResume`/`reviseCoverLetter`, same grounding as the Feature 30 generators plus the current stored content and conversation history, returning `{ reply, content }` — `reply` is a short conversational confirmation shown in the chat thread, `content` is the full revised document. `POST /api/documents/chat` re-fetches the current document server-side (never trusts client-sent content), 404s clearly if nothing's been generated yet. Persistence logic shared with Feature 30's generate route via a new `lib/documentPersistence.ts` helper (extracted to avoid duplicating the render/upload/upsert block).

**UI:** `components/job-details/DocumentChatEditor.tsx` — small chat panel nested inside each `DocumentGenerator.tsx` action panel, visible once that document exists. User messages get plain neutral bubbles; AI replies use the Agent Content teal treatment (`border-agent`/`bg-agent-light`/`text-agent-dark`) since they're genuinely agent-generated text, consistent with the rule everywhere else in the app.

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

---

# Master Feature Inventory

**Consolidated 2026-07-21.** Single source of truth for every feature discussed anywhere — the v1/v2 phases above, plus everything that came out of the five strategy sheets (Launch Playbook, Revenue Map, Career OS, Competitive Map, Built to Last) and the follow-up feature brainstorm. If a feature isn't in this table, it hasn't been agreed.

**Status key:** ✅ done · 🎨 design preview built (`/preview`, dummy data, no backend) · 📋 planned (has a phase) · 🆕 new (agreed, not yet scoped into a phase)

> **🎨 is not "nearly done".** The preview pages under `/preview/*` are static components fed placeholder props. Every one of them still needs the full backend behind it — schema, migration, an API route, metering, rate limiting, kill switch, and live verification — before it ships. Treat 🎨 as *"the design question is settled, the engineering hasn't started."* The components themselves are props-driven and reusable, so none of that work is thrown away; only `app/preview/*` gets deleted at the end.

## The spine — build these in this order

Everything else is a facet of these three. Sequence matters: each one makes the next cheaper to build.

1. **Application tracker + rejection intelligence** — attacks the #1 documented user pain (the feedback black hole), gives users a daily reason to return, and is the data foundation everything else sits on.
2. **Portable career identity** — the tracker's data plus an always-current profile becomes the own-your-data career record. This is *bet #2* from Built to Last and the connective tissue that turns a pile of features into one product. Most items in sections E and F below are facets of it.
3. **Passive market-watch ("A-grade only")** — the identity, pointed outward. Serves the 70% of the workforce not actively looking, and converts the churn problem into a retention advantage.

## A. Job data & coverage

| Feature | Status | Source |
| --- | --- | --- |
| SerpApi job discovery | ✅ | Phase 6 |
| ATS provider adapters (Ashby, Greenhouse, Lever) | 📋 | Phase 8 |
| Structured job APIs (Adzuna, Arbeitnow, TheirStack, Apify, Serper) | 📋 | Phase 8 |
| Custom board queries | 📋 | Phase 8 |
| Posting liveness / freshness checks | 📋 | Phase 10 |
| Dedup & status normalization | 📋 | Phase 14 |
| Ghost-job & layoff-risk company signals | 🆕 | Brainstorm |
| **"Add job" — evaluate any external posting** (paste a job from anywhere, not just scanned sources) | 🆕 | Teardown, their "External" jobs tab. Real gap: our evaluation only ever runs on jobs *we* found — this lets a user bring their own and get the same 10-dimension grade + tailored documents |
| **Saved-job liveness status** (Active / Closed sub-tabs on saved jobs) | 🆕 | Teardown, their "Liked" tab. A sharper UI for the freshness-check work already in Phase 10 — surface it as a per-saved-job status, not just a scan-time filter |

## B. Evaluation & intelligence

| Feature | Status | Source |
| --- | --- | --- |
| 10-dimension A–F evaluator | ✅ | Phase 9 |
| Multi-provider model router | ✅ | Phase 7 |
| Deep company research (Browserbase/Stagehand) | ✅ | Phase 10 (partial) |
| Company research — candidate angle | 📋 | Phase 10 |
| Company enrichment APIs (People Data Labs, LinkdAPI) | 🆕 | Launch Playbook |
| Cross-application pattern analytics (personal funnel diagnosis) | 🆕 | Brainstorm |
| Live salary / comp benchmarking | 🆕 | Career OS + Brainstorm |
| Job-description decoder (must-have vs. padding) | 🆕 | Brainstorm |
| "Should I apply?" quick verdict | 🆕 | Brainstorm |
| Skills-first evaluation (skills over titles) | 🆕 | Built to Last (bet #3) |
| **Correctable skill tags — human-in-the-loop** | 🆕 | Competitor teardown — see note below |
| Job requirements split into **Required** vs **Preferred** | 🆕 | Competitor teardown |
| Match sub-scores (experience / skill / industry, scored separately) | 🆕 | Competitor teardown |
| **Conversational per-job AI chat ("Ask Orion")** — evidence-cited breakdown (Relevant Experience / Seniority / Education / Core Skills aligned vs. not-aligned, each citing the candidate's actual employers) + free-text follow-up + regenerate | 🆕 | Teardown (2026-07-21 deep pass). Genuinely richer than a static one-liner — reuses the chat-panel pattern we already built for `DocumentChatEditor`, just pointed at job-fit Q&A instead of document revision |

> **Correctable skill tags deserve their own note.** The competitor renders every skill the AI *thinks* you have as a clickable tag, with the instruction: *"If anything seems off, you can easily click on the tags to select or unselect skills to reflect your actual expertise."* The user corrects the model, and the match re-scores.
>
> This is the single most on-thesis feature in their entire product for us. Sortie's durable bet (Built to Last, #4) is **explainable AI where the human always decides** — and this is exactly that, made concrete: the evaluation stops being a verdict handed down and becomes a conversation the user can correct. It also quietly fixes bad extractions from the résumé parser, and every correction is training signal about what the user actually knows. High priority.
>
> **Visual treatment, confirmed by scrolling the real page (not just reading its text):** tags are color-coded, not just clickable — a green pill with a thumbs-up icon for a skill the model believes you have, plain grey text for one it doesn't. That distinction should carry into our own version so a user can tell "matched" from "gap" at a glance before reading anything.

## C. Documents

| Feature | Status | Source |
| --- | --- | --- |
| ATS resume + cover letter generation | ✅ | Phase 11 / F30 |
| AI Co-Pilot chat revision | ✅ | Phase 11 / F32 |
| 3 ATS-safe resume themes | ✅ | Custom (2026-07-19) |
| Application email drafts | 📋 | Phase 11 / F31 |
| Resume version manager (slots, primary flag, per-résumé status) | 🎨 | Brainstorm + teardown — `/preview/resume` |
| Follow-up & thank-you generator + timing nudges | 🆕 | Brainstorm |
| DOCX / Markdown export | 📋 | Phase 16 |
| **Resume fit / gap analysis** (score 0–10, per-check gaps, keyword coverage) | 🎨 | Competitor teardown — **design preview built** |

### C1. Resume editor — shipped 2026-08-05 (Phase 7)

Today Sortie's flow is *click Generate → receive a PDF*~~. The competitor teardown (2026-07-21) showed a full editing workspace instead: a live document preview beside a three-tab rail.~~ **Real as of this session** — `app/resume/tailored/[jobId]/page.tsx` + `components/documents/ResumeWorkspace.tsx`. Full build detail in `progress-tracker.md`'s top entry; component-level notes in `ui-registry.md`.

| Feature | Status | Notes |
| --- | --- | --- |
| Live preview pane | ✅ | `@react-pdf/renderer`'s `PDFViewer` wraps the real `ResumePDF`, not a separate HTML approximation |
| Page counter + "fit to one page" | 🆕 | Not built — `PDFViewer`'s own toolbar covers page navigation; "fit to one page" (AI-driven auto-shrink) deferred, real added AI cost with no clear demand signal yet |
| **Score jump + "what changed" changelog** | ✅ | `lib/scoreJump.ts` — real gap found building this: the fit score was always computed against the base *profile*, never the tailored résumé, so it could never move before this. Now scores against whatever's actually in the workspace |
| **One-tap refinement chips** | ✅ | `RefinementChips.tsx`, routed through the same `useDocumentChat` hook `DocumentChatEditor` uses — chips and the chat box currently keep independent message-log state (deliberate simplification, not a bug) |
| **Style controls** — template, theme, page size, accent colour, font sizes, header alignment, skills columns, bullet style, spacing sliders | ✅ | `StyleTab.tsx`, props into a fully-generalized `ResumePDF.tsx` |
| Section-level edit + drag-to-reorder + hide | ✅ | `EditorTab.tsx`, first real drag-and-drop in this codebase (`@dnd-kit`, new dependency) — hide is soft (kept in array), no arbitrary custom sections beyond the 4 existing types |
| **3 structurally distinct templates** (Centered/Structured/Split) | ✅ | Not just style variants — `split` is a genuine two-column sidebar layout, modeled on the real LinkedIn-export PDF this project's own résumé-sync test data already surfaced |
| Multi-resume switching in the editor | 🆕 | Still deferred — one workspace = one job's tailored résumé, matching today's 1:1 job↔application model |
| Visible credit/usage consumption in-editor | 🆕 | Still deferred, minor |

**Design preview (superseded by the real build above):** `/preview/resume` — was pure static JSX with dummy data, no real state or API wiring; kept as a design reference, not touched by this build.

#### The base-résumé vs tailored-copy data model — decide before building

The competitor surfaces this explicitly in their editor: *"Section order changes will be saved, other edits here apply only to this resume. For major updates like editing experiences, update your Base Resume to affect future resumes."*

That single sentence encodes a real architectural decision we have to make deliberately, because getting it wrong is destructive:

- **One base résumé** = the user's actual career history (the `profiles` row today). The source of truth.
- **Many tailored copies** = per-job derivatives. Each stores its own generated content, style settings, and section order.
- **Edits to a tailored copy must never silently rewrite the base.** If someone reshuffles bullets for one application, that can't retroactively alter their real history or every future résumé.
- **Some settings are global, some are per-copy.** Section *order* and style preferences reasonably persist across résumés; content edits do not.
- Needs a `resumes` table (base + derivatives, with a `is_primary` flag and a slot cap), not just the current single `profiles.resume_pdf_url`.

Without this split, multi-résumé, the style controls, and section editing all collide with each other.

### C2. Authentication &amp; sign-in

Captured from the recorded walkthrough (2026-07-21). Notable for how little there is — that's the point.

| Feature | Status | Notes |
| --- | --- | --- |
| Google OAuth | ✅ | Already working |
| GitHub OAuth | ✅ | Already working |
| **Google One Tap** (inline account chooser, not a redirect) | 🆕 | Their flow shows name + email in a popup with a "Continue as {name}" button and the standard consent line about sharing name, email and profile picture. Far lower friction than a redirect round-trip |
| **No separate signup form** — OAuth lands straight in onboarding | 🆕 | There is no account-creation screen, no password, no email-verification step. Auth completes → immediately into the role picker. Matches our `/preview/onboarding` flow |
| Logout available *during* onboarding | 🆕 | An escape hatch on every onboarding step, so a half-finished setup isn't a trap |
| LinkedIn OAuth | 🆕 | Highest-value addition for a career product — doubles as profile prefill. Note: LinkedIn's API only returns name/email/photo, **not** work history, so résumé upload stays the real import path |
| Email / magic-link sign-in | 🆕 | For people who won't use social login |
| Dual entry points on marketing page | 🆕 | "Join now" in the nav + "Try for free" in the hero, both to the same auth |

**Backend implication:** the `on_auth_user_created` trigger we added on 2026-07-21 already provisions a `profiles` row for any new OAuth user, so adding LinkedIn or email sign-in won't reintroduce the "profile won't save" bug. Any new provider must be verified against that trigger.

#### Profile field granularity — a schema gap, not just a feature gap

Their profile wizard (Personal → Education → Work Experience → Skill → Equal Employment) splits contact info far finer than ours: **First / Middle / Last name** (we store one `full_name`), **Phone Type + Country Code + Phone** (we store one `phone`), and a full **Address Line / Country-Region / State-Province / City** breakdown (we store one `location` string).

This isn't cosmetic — it's what a real ATS-autofill feature requires. Workday/Greenhouse/Lever forms ask for these fields separately, so a coarse `full_name`/`phone`/`location` schema can't power autofill later without a painful re-migration. **If the Chrome extension (section G) or any future application-autofill feature is actually going to happen, this schema split should happen before those, not after.**

| Feature | Status | Source |
| --- | --- | --- |
| Split contact fields (name parts, phone type/country code, structured address) | 🆕 | Teardown — prerequisite for any future autofill feature |
| **Equal Employment / voluntary self-ID** (race/ethnicity, gender, veteran status, disability — the standard EEOC fields many ATS applications request) | 🆕 | Teardown. Sensitive data — must be clearly optional, separately consented, and never required to use the product |

## D. Application tracking & post-application

| Feature | Status | Source |
| --- | --- | --- |
| **Application tracker** | ✅ | Phase 15 (Kanban) — **spine #1**, shipped 2026-08-11 |
| Kanban board UI (Applied / Interviewing / Offered) | ✅ | Phase 15 — page renamed "Missions" 2026-08-12 (`/missions`, was `/pipeline`), List view toggle added same day (researched via agy: real trackers use one unified view + filter, not per-stage pages) |
| **Rejection intelligence** (diagnose employer silence) | ✅ | Career OS — **spine #1**, shipped 2026-08-11, `lib/rejectionIntelligence.ts` |
| Application timeline view (per-job history) | 🆕 | Brainstorm (UI) |
| Interview debrief capture | 🆕 | Brainstorm |
| Deadline tracker / application calendar | 🆕 | Brainstorm |
| Dashboard filter/sort/group parity | 📋 | Phase 14 |

## E. Career identity & post-hire (the Career OS)

Serves the 70% of the workforce who aren't actively job-hunting — the retention engine.

| Feature | Status | Source |
| --- | --- | --- |
| **Portable career identity** (own-your-data career record) | ✅ MVP | Built to Last (bet #2) — **spine #2**, shipped 2026-08-11 as `/career` — accomplishment log + merged timeline (profile history + accomplishments + real job outcomes). Richer sub-features below (warm-up mode, promotion prep, skill-gap/pathing, skills testing, career simulator, weekly briefing) deliberately deferred, not forgotten — need their own scoping pass on top of this base |
| Data portability / full career-record export | ✅ | Built to Last — shipped 2026-08-11, `/api/career/export` (JSON) |
| **Passive market-watch** ("A-grade only" pings) | 🆕 | Career OS — **spine #3** |
| Always-warm résumé | 🆕 | Career OS |
| Running accomplishment log | 🆕 | Career OS |
| Personal-brand upkeep nudges | 🆕 | Career OS |
| "Warm-up mode" (comp benchmarks + gap-to-target + get-ready plan) | 🆕 | Career OS |
| Promotion / performance-review prep (brag docs, self-reviews) | 🆕 | Career OS |
| Skill-gap tracking & career pathing | 🆕 | Career OS |
| Skills verification & proficiency testing | 🆕 | Built to Last |
| Career-path simulator (3-year trajectory comparison) | 🆕 | Brainstorm |
| Weekly AI career briefing | 🆕 | Brainstorm |

## F. Interview, offer & negotiation

| Feature | Status | Source |
| --- | --- | --- |
| Negotiation scripts | 📋 | Phase 12 |
| Offer evaluation & total-comp analysis | 🆕 | Career OS — see Equity & Cap Table Decoder, §M |
| Multi-offer comparison | 🆕 | Career OS |
| First-90-days success plan | 🆕 | Career OS |
| Hiring contact discovery + outreach drafts | 📋 | Phase 13 |

**Interview section fully rescoped 2026-08-12 (2 agy research passes) — see §N below for the full "Engagement War Room" plan.** Replaces the old "Interview story bank" / "Per-job interview prep" / "Live mock-interview simulator" / "Interview question bank by company" rows above with a concrete, buildable architecture.

**Explicitly skipped (2026-07-21):** human 1-on-1 recruiter coaching, sold as a premium tier ("I'm trying to find my first job" / "I'm applying but hearing nothing" / "I have an interview coming up" → "Meet My Coach"). It's a real, well-designed problem-framed entry point — worth borrowing the *framing* for our own AI-powered equivalents (offer analysis, rejection intelligence, interview prep already cover the same three problems) — but the human-service delivery model doesn't scale the way software does and isn't something we're building for now.

## N. Interview section — "Engagement War Room" (researched 2026-08-12, not yet built)

Direct response to a live-observed JobRight feature: their `/interview` page is a static, human-moderated company question database (428 companies, 9,645 questions, gated paywall) — real content-ops work a small team can't replicate. Two agy research passes concluded: (1) genuinely legal/free sources to scrape or aggregate for this don't meaningfully exist at any useful scale (Reddit's API bans commercial/AI use without an enterprise deal, LeetCode/Blind explicitly ban scraping, Glassdoor/Indeed interview content sits behind a login wall with no API — CFAA risk, not just ToS — and unlicensed GitHub "awesome-interview-questions" repos are generic trivia, not company-specific); (2) the honest, legal, scalable answer is AI-generated content, cached and reused, clearly labeled as predicted rather than sourced from real interviews — same "generate once, persist, reuse" shape already used throughout this app (company research dossier, Strategic Moat Briefing, Interview Panel background all already work this way). This also becomes a real differentiation angle: JobRight's coverage is bounded by moderator bandwidth (428 companies); AI generation has no such ceiling.

Structured as three phases, only one genuinely new data-generation pipeline (the Question Bank) — everything else synthesizes data this app already produces:

| Phase | Feature | Status | Notes |
| --- | --- | --- | --- |
| 1. Reconnaissance | Strategic Moat Briefing | ✅ shipped 2026-08-12 | Already feeds this phase, see §M |
| 1. Reconnaissance | Interview Panel Topology | ✅ shipped 2026-08-12 | Already feeds this phase, see §M |
| 1. Reconnaissance | **Cached AI Question Bank** | 🆕 | Keyed on `(company, role-family, seniority)`, not per-job — genuinely reusable across users/postings. Generated once, persisted, instant on every later hit. UI must label honestly ("AI-predicted, based on known tech stack and role expectations"), never imply real leaked/sourced questions |
| 2. Arsenal | **STAR Story Matrix** | 🆕 | Concrete version of the old "interview story bank" row — candidate enters real career stories once, AI maps each to the specific questions the Question Bank + job posting suggest are likely |
| 2. Arsenal | **The Interrogation Plan** | 🆕 | Questions *for the candidate to ask*, synthesized from Moat Briefing + Panel Topology (both already-shipped data, zero new generation pipeline) |
| 2. Arsenal | **Trap Door Predictor** | 🆕 | Cross-references company dossier + recent news for likely tough behavioral questions (e.g. a company that just did layoffs flagged for "grind culture" probing) |
| 3. Live Fire | **Live-Fire Scenario Simulator** | 🆕 | Concrete version of the old "live mock-interview simulator" row — conversational, roleplays as the actual named interviewer from Panel Topology, questions rooted in the real Moat Briefing content, not generic prompts |

**Explicitly not touched by this rescope**: negotiation scripts (separate, post-offer concern) and the Equity Decoder/Leverage Synthesizer work (§M, queued for this same next session before this Interview work starts).

**Sequencing, per explicit user decision (2026-08-12)**: build Features 5-6 from §M (Equity & Cap Table Decoder, Post-Offer Leverage Synthesizer — already scoped, left unbuilt from the differentiation batch) first, finishing what was started this session, *then* start on this Interview section next session.

## G. Integrations & plugins

| Feature | Status | Source |
| --- | --- | --- |
| **Chrome extension — capture-first** ("save → grade → track", never auto-apply) | 🆕 | Competitive Map |
| Gmail ingest (job leads) | 📋 | Phase 16 |
| Gmail — application status detection (powers rejection intelligence) | 🆕 | Competitive Map |
| **Network signals** (former colleagues / school alumni at this company) | 🎨 | Free — deep-links to LinkedIn people search, no paid people API, no scraping. `NetworkSignals.tsx` built |
| Work-email lookup (Hunter/Apollo) | ⛔ deferred | Paid ($39–49/mo) **and** CASL/GDPR exposure — needs a compliance review first |
| LinkedIn-alerts ingest | 📋 | Phase 16 |
| LinkedIn profile import (onboarding) | 🆕 | Competitive Map |
| Google Calendar / Outlook interview detection | 📋 | Phase 16 |
| Notion + Obsidian export | 📋 | Phase 16 |
| Zapier / Sheets export | 🆕 | Competitive Map |
| Push / browser notifications | 🆕 | Brainstorm |
| Proactive match digest email | 🆕 | Brainstorm |

**Explicitly rejected:** auto-apply / mass-autofill. It's commoditized, users report it damages their credibility, agentic hiring will absorb it, and it directly contradicts the "aim, don't spray" positioning. Do not build.

## H. UI / UX

| Feature | Status | Source |
| --- | --- | --- |
| Command palette (Cmd+K) | 🆕 | Brainstorm |
| Detail drawer / split view (fast job browsing) | 🆕 | Brainstorm |
| Global search | 🆕 | Brainstorm |
| Rich filtering & sorting on Find Jobs | 📋 | v1 F11 (partial) |
| Job card quick-actions (save/hide/generate inline) | 🆕 | Brainstorm |
| Job comparison view (side-by-side, 10 dimensions) | 🆕 | Brainstorm |
| Bulk actions (multi-select archive/tag) | 🆕 | Brainstorm |
| Tags & personal notes on jobs | 🆕 | Brainstorm |
| Recently viewed / pinned jobs | 🆕 | Brainstorm |
| Profile completeness meter | 🆕 | Brainstorm |
| **Onboarding flow** (role picker → work auth → resume upload → seniority confirm) | 🎨 | `/preview/onboarding` built. The role picker is a *searchable* input plus a two-panel category→role browser; their version also carries an explicit **"H1B sponsorship" checkbox** alongside work authorization. Both feed the visa/work-authorization dimension, which currently has no real data behind it |
| **"How did you find us?"** attribution step | 🎨 | Free growth analytics — tells you which channel actually converts |
| Guided first-run product tour (tooltip walkthrough) | 🆕 | Competitor teardown |
| Empty states with guidance | 🆕 | Brainstorm |
| **Loading states that teach + time expectations** ("usually 10–20 seconds") | 🎨 | Turns dead wait time into feature discovery |
| Skeleton loaders + optimistic UI + toast system | 🆕 | Brainstorm |
| Contextual tooltips explaining the 10 dimensions | 🆕 | Brainstorm |
| Keyboard shortcuts | 🆕 | Brainstorm |
| Analytics dashboard (funnel, score distribution, skills radar, heatmap) | 📋/🆕 | v1 F17 + Brainstorm |
| "Today" / focus view | 🆕 | Brainstorm |
| Customizable dashboard widgets | 🆕 | Brainstorm |
| Installable PWA + mobile responsive polish | 🆕 | Brainstorm |
| Accessibility (WCAG) pass | 🆕 | Brainstorm — also a B2B requirement |
| App-level theme customization (accent, density) | 🆕 | Brainstorm |
| **Notification / activity inbox** (empty state explains what will arrive) | 🎨 | `/preview/more` — the delivery surface for market-watch pings and application status changes |
| **Settings panel** (login & security, subscription, credits & usage, job alerts) | 🎨 | `/preview/more` — includes the account-deletion UI, which is Phase 0 task #33 and a GDPR/CCPA obligation |
| **Feature announcement + waitlist modal** | 🎨 | `/preview/more` — how to launch an expensive beta to a bounded audience rather than everyone at once |
| Light/dark mode | ✅ | Custom (2026-07-18) |

#### The "Introducing [Feature] — Beta" showcase pattern, source-verified

Captured from a real screenshot you shared (Profile page, not one of the extracted video frames): **"Introducing Jobright Agent [Beta]"** — subhead *"The first AI that hunts jobs for you — see it in action now,"* an embedded demo video, then three stat callouts side by side — **2x Interview Landed / 80% Time Saved / 24/7 Working for You** — a **"You're on the Waitlist"** badge, and a **"Skip Waiting and Enable Agent Now"** button offering to jump the queue.

This is the exact pattern our own `BetaModal` in `/preview/more` was designed around (stat row, waitlist position, "Join the beta" CTA) — the design preview already implements this showcase style, it just wasn't traced back to this specific source before now. Worth keeping the connection explicit: when we gate our own first expensive beta (most likely candidate: the passive market-watch feature, §E), this is the proven template — big benefit-led stats, not a feature-list, plus a visible queue position so "waiting" doesn't feel like "ignored."

**The Agent feature itself, separately:** visited live and found genuinely empty — the actual `/agent` page returns only a skeleton loader with no content, confirming it's gated behind this same waitlist for us as an outside observer. Nothing to learn from the real feature (if it even has content yet); the showcase modal is the only real artifact captured. Consistent with the existing decision not to build auto-apply (§G) — if their "Agent" turns out to be an auto-apply agent once unlocked, that's further reason not to chase it.

### H1. Job detail page — full anatomy

Captured from a complete walkthrough of the competitor's job detail page (2026-07-21). Ours currently has: agent read, 10-dimension grid, skills comparison, company research, document generator. This is everything *they* show, so gaps are visible at a glance.

**Overview tab, in order:**

| Section | Contents | Sortie status |
| --- | --- | --- |
| Sticky action bar | Contextual badges ("Be an early applicant", "Less than 25 applicants"), hide, save, primary apply CTA | ✅ shipped 2026-07-22 (`JobActionBar.tsx`) — Save/Hide + freshness/Remote badges are real; "early applicant"/"under 25 applicants" badges explicitly not built, no data source (SerpApi doesn't carry applicant counts) |
| Header | Company · relative post time ("1 minute ago"), title, then a meta grid: location, work mode, salary range, employment type, seniority, years required | Partial — freshness ✅ shipped 2026-07-22 (`jobs.posted_at`, confirmed live SerpApi provides this for free), work mode still ⛔ (no structured field exists in SerpApi's response at all, only a text-match "Remote" heuristic — a real work-mode column would overclaim precision we don't have) |
| Match panel | Headline % + band ("97% STRONG MATCH") with **sub-scores broken out**: Experience Level 100%, Skill 100%, Industry Exp. 49% | 🆕 (we have richer 10-dim data, weaker presentation) |
| Company blurb | One paragraph with company name and role bolded, then industry tags | Partial — `industryTags` ✅ shipped 2026-07-22 (extends the existing `CompanyResearchDossier`, no new AI call), the blurb paragraph itself (`companyOverview`) already existed pre-session |
| **Insider Connection** | Three buckets — *Beyond Your Network* / *From Your Previous Company* / *From Your School* — each with avatars, names, "Previously@…" context, and a View / Find More Connections link. Metered ("2 email credits available today") | ✅ shipped 2026-07-23 (`InsiderConnections.tsx`), paid via Apify (`harvestapi` actors, ~$0.31-0.32/lookup, capped 3/day), opt-in only, no billing/subscription gate yet (stated plan: gate behind a future paid tier). `NetworkSignals.tsx` remains the free/always-available fallback for users past the cap |
| Find Any Email | Paste a LinkedIn profile URL → work email | ⛔ dropped, not just deferred — the fallback tool (`dev_fusion`'s actor, URL-based) is blocked on Apify's free plan for API use; the working alternative (HarvestAPI) is filter-based (name+company), not URL-based, so an arbitrary-URL paste box genuinely isn't buildable on this tier. Per-person email reveal on already-found Insider Connections *is* shipped (~$0.10/lookup, capped 4/day) |
| Responsibilities | Bulleted list | ✅ have |
| **Qualification** | Interactive skill tags (matched vs not) + **Required** list + **Preferred** list, with the "click tags to correct" affordance | ✅ shipped 2026-07-22 (`Qualification.tsx`) — clicking a tag calls `correctSkillTag`, moves it between matched/missing; a data correction only, does not re-run the evaluator or change `match_score` |
| Benefits | Bulleted list | ✅ have |

**Company tab:**

| Section | Contents | Sortie status |
| --- | --- | --- |
| Company card | Logo, description, socials (X / LinkedIn / Crunchbase), **Glassdoor rating**, founded year, HQ, employee count, website | Partial |
| **Funding** | Current stage, total funding, and a dated timeline of rounds | 🆕 — needs Crunchbase ($49–99/mo, free tier gone) or a cheaper alternative |
| **Leadership Team** | Photo cards, name, title, LinkedIn link | ✅ shipped 2026-07-22/23 — waterfall: Wikipedia (free) → site-guessing (free) → Apify/LinkedIn (paid, ~$0.10-0.11, last resort only). Photo cards with LinkedIn icon overlay match JobRight's own treatment; real photos only from the Apify path, initials-avatar fallback otherwise |
| **Recent News** | Three cards: source, headline, date | 🆕 — cheap via a news API or the existing research agent |
| Attribution | "Company data provided by Crunchbase" | — |

**Persistent right rail (both tabs):** AI Tools — *View Custom Resume* (with "Updated {date}"), *Build Cover Letter*, *Analyze How Well You Fit*. Sortie has all three capabilities but doesn't surface them as a persistent rail.

**Cost note:** funding data and Glassdoor ratings are the only genuinely expensive items here. Leadership team, recent news, required/preferred split, industry tags, freshness, and the correctable skill tags are all cheap or free — and the correctable tags are the highest-value item on this page for us.

> **How Insider Connection is actually showcased, confirmed by screenshot, not just described:** the three buckets render as distinct colored header pills — *Beyond Your Network* in green, *From Your Previous Company* in blue, *From Your School* in purple — each a separate card, with real profile photo/initial avatars for the "previous company" bucket specifically (the other two showed empty in the account tested, presumably placeholders when no overlap exists). A single **"2 email credits available today"** badge sits top-right of the whole section, and a bold callout line above the cards — *"Get 3x more responses when you reach out via email instead of LinkedIn"* — is the actual sales pitch for the paid email-lookup feature, working the free "Find More Connections" links and the paid "Find Any Email" box into one visual block rather than two separate features. If we build the free half (`NetworkSignals.tsx`), this color-per-bucket treatment and that one-line pitch are worth carrying over directly.
>
> **How the Company tab is actually showcased:** each Funding round renders as its own small card (date, round type, amount) in a horizontal row rather than a plain list — visually distinct from a bullet list, and it's what makes "funding timeline" read as a feature rather than a data dump. Leadership Team is photo-card-per-person with a LinkedIn icon overlay in the corner of the photo, not a table row. Small, cheap details, but they're the difference between "we have company data" and "this looks like a real product."

## I. Growth surface & SEO

| Feature | Status | Source |
| --- | --- | --- |
| Free ATS score checker (no-login lead magnet) | 🆕 | Launch Playbook |
| Programmatic SEO pages built on evaluation data | 🆕 | Launch Playbook |
| JobPosting structured data + sitemap + robots.txt | 🆕 | Launch Playbook |
| Editorial content / guides (for backlinks & authority) | 🆕 | Launch Playbook |
| Shareable public evaluation link | 🆕 | Brainstorm |

## J. Monetization

| Feature | Status | Source |
| --- | --- | --- |
| Free tier + metering | ✅ | Phase 0 |
| Stripe subscription (Pro tier) | 🆕 | Revenue Map |
| Premium done-for-you tier ($49–99/mo) | 🆕 | Revenue Map |
| Problem-framed help entry points ("I'm applying but hearing nothing") | 🎨 | The premium tier's front door, framed as the user's problem rather than a feature list |
| Credit packs / à la carte top-ups | 🆕 | Revenue Map |
| Affiliate / referral integrations | 🆕 | Revenue Map |

## K. Trust, safety, legal & ops

| Feature | Status | Source |
| --- | --- | --- |
| RLS on all user-data tables | ✅ | Phase 0 |
| Per-user daily metering | ✅ | Phase 0 |
| Provider cost policy (public = Gemini only) | ✅ | Phase 0 |
| Rate limiting on AI routes | ✅ | Phase 0 |
| Feature kill switches | ✅ | Phase 0 |
| Signup cap / waitlist | ✅ | Phase 0 |
| Privacy Policy + Terms | 📋 | Phase 0 |
| Account deletion / data erasure | 📋 | Phase 0 |
| Multi-tenancy isolation test | 📋 | Phase 0 |
| Error monitoring (Sentry) | 🆕 | Launch Playbook |

## L. B2B / white-label (the durable revenue destination)

| Feature | Status | Source |
| --- | --- | --- |
| Multi-tenancy hardening (prerequisite) | 🆕 | Revenue Map |
| White-label branding (logo, colors, subdomain) | 🆕 | Revenue Map |
| Org admin / cohort management | 🆕 | Revenue Map |
| Outcome reporting for institutions | 🆕 | Revenue Map |

## M. Differentiation batch (agy research, 2026-08-11→12)

Two agy research passes produced 13 candidate ideas total. First pass (7 ideas) mostly overlapped with items already elsewhere in this inventory, cross-checked and folded in rather than listed separately. Second pass (6 ideas) is tracked here — 3 needed honest rescoping before building (real turnover/funding data has no free source; posting-history tracking conflicts with this app's no-re-scrape design), confirmed with the user before starting. Also researched, same window: whether the tracker should have per-stage pages (agy: no, real trackers use one unified view + filter — see the Kanban board UI row above) and a rename for "Pipeline" (agy: "Missions", picked over "Radar"/"Ops"/"Flight Deck").

| Feature | Status | Notes |
| --- | --- | --- |
| **Bait-and-Switch Risk Scorer** | ✅ | Rescoped from "posting rewritten multiple times" (needs history-tracking this app deliberately doesn't do) to a single-snapshot title-vs-responsibilities mismatch check riding on the existing evaluator call — zero marginal AI cost. `jobs.title_scope_mismatch` |
| **Reappearing Requisition Signal** | ✅ | Rescoped from "Churn Seat Tracker" (needs LinkedIn data this app has already ruled out, or a paid API that doesn't exist) to: same (company, title) reappearing across a user's own search history over time — the one legally-clean free signal found. `lib/churnSignal.ts`, zero AI cost |
| **Strategic Moat Briefing** | ✅ | Recent-news/strategic-priorities dossier lens, distinct from the existing culture/tech-stack one. `researchStrategicMoat()` in `agent/research.ts` |
| **Interview Panel Topology** | ✅ | Named-interviewer background lookup (names come from the candidate, not discovered) — conservative extraction, public professional facts only. `interview_panel_members` table |
| **Equity & Cap Table Decoder** | 🆕 | Rescoped from a funding-data lookup (needs Crunchbase, no free tier — already flagged as the one genuinely expensive gap in section H1) to a pure calculator on user-entered offer numbers. Not yet built |
| **Post-Offer Leverage Synthesizer** | 🆕 | Same honesty-scoped shape as Rejection Intelligence — grounded only in real known data (posting age, days at Offer stage, stored evaluation), never fabricated "time-to-hire" benchmarks. Not yet built |

## Durable principles (constraints on *how* everything above gets built)

These aren't features — they're the guardrails that keep the product on the right side of where hiring is heading. From Built to Last.

- **Be the candidate's agent**, never the employer's. Neutrality is the moat incumbents structurally can't copy.
- **Everything stays explainable** — always show the "why," the human always decides. Never a black box. (Also aligns with EU AI Act direction and is a B2B selling point.)
- **Judgment over speed** — never drift into auto-apply/spam territory, regardless of competitive pressure.
- **Skills-first, not title-first** — hiring is moving this way.
- **Stay model-agnostic** — the router already delivers this; keep it.
- **The user owns their data** — portability isn't a nice-to-have, it's what makes the career identity trustworthy.
