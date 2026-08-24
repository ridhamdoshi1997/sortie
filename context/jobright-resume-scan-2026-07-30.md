# JobRight Live Scan — 2026-07-30

Live-scanned via the Claude-in-Chrome extension against a real, fresh JobRight account (signup through
full product tour), not just the screenshots the user had already pasted into chat — see
`feedback_competitor_scan_with_extension` in cross-session memory for why this matters going forward.

**Note on screenshots:** the browser tool's screenshots aren't files on disk and couldn't be exported/saved
as images into this repo — this doc is the durable record instead: a detailed written breakdown of every
screen and state observed, which is what's actually needed to build from. If a literal image reference is
ever needed, the scan can be re-run live in a few minutes.

This is reference material for building our own multi-résumé + résumé-analysis system. Per this project's
existing rule, we build our own version informed by this, not a clone — see `ui-tokens.md`'s color rules
and the "Sniper not Machine Gunner" positioning in `sortie-strategic-analysis-2026-07-28.md`.

---

## 1. Onboarding (`/onboarding-v3/...`)

Two-step conversational flow, split-screen: "Orion" (their AI copilot persona/mascot) asks a question on
the left in large text, a form answers it on the right.

1. **"What type of role are you looking for?"** — Job Function (free text), Job Type (checkboxes:
   Full-time/Contract/Part-time/Internship), Location (country dropdown + region + "Open to Remote"
   checkbox, all pre-filled with sensible defaults).
2. **"One last step, let's level up your search by uploading your resume."** — drag/drop upload, PDF or
   Word, up to 10MB, with a data-privacy trust note. Notably **not a hard gate** — "Start Matching" stays
   clickable even without a file.
3. **Confirmation modal**: "🎉 Welcome! We found N roles that fit you best." — an editable "Recommended
   Experience Levels" checklist (AI pre-selected two levels based on the uploaded résumé), a "Where did you
   hear about us" dropdown, "Confirm & See Jobs" CTA.

## 2. Jobs feed (`/jobs/recommend`)

Filter bar: Country, Job Title, Experience Level, Job Type, Work Model, Date Posted, Industry, Years of
Experience, a "Hidden Jobs" toggle, "All Filters" catch-all, sorted by "Recommended".

Right rail: user badge + plan tier, "Your Saved Filters", and a gamified **"Complete to Win 1v1 Private
Coaching"** checklist (0% → tracks real completion, e.g. "Customize Your Resume" ticked off after actually
generating one) — a genuine incentive loop, not just decoration.

Job cards: posted time, "Be an early applicant" + applicant-count badges, location/work-model/
seniority/years row, a match-score ring (e.g. "71% GOOD MATCH") with 2 short "why it matches" tags, and
either "Apply Now" or "Apply With Autofill" depending on whether autofill is available for that posting's
ATS.

**First-time guided tour**: Orion tooltips point at specific UI elements ("Adjust Your Job Preference" →
All Filters; "Generate Custom Resume — want a better shot at this job?" → per-job action) with Exit/Next.

**Per-job "Ask Orion" chat** (opens as a side panel): "I see you're asking about this [Title] role at
[Company]. What would you like to know?" with 3 suggested prompts — "Tell me why this job is a good fit
for me," "Give me some resume tips if I want to apply," "Generate custom resume tailored to this job" —
plus free text.

## 3. Job detail page

Overview/Company tabs. Match-score breakdown as **separate percentages** per axis (Experience Level,
Skill, Industry Experience) rather than one blended number — simpler than our 10-dimension grade, worth
noting as a contrast, not something to copy.

Right rail **"AI Tools"** panel, 3 actions: **Customize Your Resume**, **Build Cover Letter**, **Analyze
How Well You Fit**. After use, each becomes "View Custom Resume — Updated [date]" / "View Cover Letter —
Updated [date]" (cached, re-viewable without re-spending a credit).

**Insider Connections**: same 3-bucket pattern we already built (Beyond Your Network / From Your Previous
Company / From Your School) — **plus a standalone "Find Any Email"** tool: paste *any* LinkedIn profile
URL (not just someone the connections search already surfaced) and it finds a work email directly. This is
broader than our current implementation, which only works off already-found connections.

**Qualification section**: "Represents the skills you have... if anything seems off, you can easily click
on the tags to [correct them]" — confirms our existing `Qualification.tsx`/`correctSkillTag` pattern is
the right one.

## 4. Résumé system

### 4a. Manager (`/jobs/resume`)

Table: name, target job title, last modified, created, primary star badge, status pill. "X of 5 slots
used" counter, "+ Add Resume". Matches what we already built.

### 4b. Résumé analysis (the current build target)

Per-résumé detail view (`/jobs/resume/edit/:id`):

- **Grade badge**: a letter (A-F) + a plain-language tier label, confirmed via live A/B transition and a
  live D→C transition after re-analyzing:
  - A → **Excellent** (green)
  - B → **Good** (amber/yellow)
  - C → **Satisfactory** (orange)
  - D/F → **Improvable** (red/pink)
- **Urgent / Critical / Optional** issue counts, top-level.
- **Re-Analyze button**, credit-gated. Hitting 0 credits opens a clean paywall modal: "Out of Resume
  Analysis Credits" — shows balance (0), "at least 1 credit" needed, an "Upgrade to Turbo" CTA, **and an
  honest free path**: "Alternatively, you can come back tomorrow. Your credit will be refilled up to 1."
  Confirms a real daily-cap-then-refill pattern — directly reusable via our existing `lib/usage.ts`, no new
  mechanism needed.
- Running a real analysis shows an **"Analysis in Progress"** modal: progress bar, "Explore Jobs while you
  wait" tip, Cancel option.
- **Per-section FIX badges** inline in the document itself — contact info, professional summary, skills,
  and *each individual work-experience entry* each get their own issue count + a "FIX" button.

**"View Full Report" side panel**: an Analysis Summary paragraph, then always these **3 stable categories**
(confirmed identical across two different résumés, so not randomly generated per-run):

1. **Relevance** — e.g. "Summary Needs Improvement"
2. **Impact & Achievements** — multiple distinct issue *types* seen under this one category: "Lack of
   Accomplishment" (no quantified result) and "Methodology Explanation" (no specifics on *how* something
   was done)
3. **Style & Sections** — e.g. "Important Fields Missing"

Each issue card has severity (Minor/Urgent/Critical), a one-line description, a "Why This Is Important"
paragraph, and an expandable "Learn why this matters" link. Panel ends in a "Begin Improvements Now" CTA.

**Per-bullet drill-down** (clicking a section's "FIX" button): a left sidebar listing *only the flagged
bullets* for that section (clean bullets are skipped entirely, not shown). For each flagged bullet:

1. **Original** — the current text, verbatim.
2. **Check Your Issues** — issue type (e.g. "Lack of Accomplishment"), "Issue Detected" (what's
   specifically wrong), "Why This Is Important", "How to Improve" (concrete guidance with examples).
3. **"View AI-generated Version from orion"** — the suggested rewrite shown as a **word-level diff**: red
   strikethrough for removed/changed words, teal for added/changed words, not a whole-line replacement.
4. **"Write Your New Version"** — an editable textarea pre-filled with the AI suggestion, so the user can
   further hand-edit before it's saved. Ties to a "Saving..." indicator near the top of the page.

**Edit Resume Info modal**: exactly two fields — **Resume Name** (required) and **Target Job Title**
(optional) → Cancel/Update. Confirms the scope of a "rename"/"edit details" action.

### 4c. Job-specific résumé tailoring (separate feature from analysis — different entry point, from the
job detail page's "Customize Your Resume", not from the résumé manager)

Also credit-gated ("X credits available today"), 3 steps:

1. **"See Your Difference"**: an overall match gauge (e.g. "3.5/10 Poor — resumes under 6.0 are likely to
   be filtered out"), then a row-by-row diff table vs. the specific job: Job Title (✅/❌), Years of
   Experience (✅/❌), Industry Experience (partial-match tags highlighted), and **Job Keywords (X/N)** —
   every technical keyword from the posting listed as chips, colored by whether your résumé already has it.
   A "Select" dropdown lets you pick *which* saved résumé to compare against.
2. **"Align Your Resume"**: two panels — left: checkboxes for which sections to touch (Summary/
   Skills/Work Experience), with Work Experience offering a real tradeoff: **"Quick Edit (first 2 key
   experiences)" vs "Full Edit (all experiences, longer processing time)"**; right: the same missing-
   keyword chips, now checkable ("Select all" available), plus a free-text "Add Keywords" escape hatch.
3. **"Review Your New Resume"**: "Finalizing... usually takes 10-20 seconds," then the result.

**Result view — style/editor panel** (right side of the tailored-résumé preview), genuinely more granular
than what we have:
- Editor tab: 4 template layouts (one marked "Recommended"), page-size dropdown, accent-color hex picker
  scoped to "All Headings".
- Style tab: date format, bullet icon (•/—), hide-divider toggle, header alignment, an education-order
  toggle (degree-first vs institution-first), skills-layout picker (3 icon options), and slider controls
  for Section/Entry/Line spacing + margins, "Align Text Left & Right", "Reset formatting".
- "Fit to one page" toggle, page counter, "Download Resume" + "Regenerate".

### 4d. Cover letter generation

Same credit-gated pattern. Result is genuinely well-tailored — pulls real specifics from the résumé and
references the job posting's own language, not generic filler. Right panel: **"AI Rewrite"** tab (chat-
style — "Your cover letter is ready! Want to tweak the tone, length, or details?" + 3 quick actions: more
confident tone / improve opening / more tailored to the job + free text) and **"Editor"** tab (plain raw-
text box with a copy icon). Download + Apply Now.

## 5. Profile (`/jobs/profile`)

**Confirmed identical tab structure to what we already built**: Personal, Education, Work Experience,
Skills, Equal Employment. Right rail: "Manage My Resume" and "Update LinkedIn URL" shortcuts, plus a
persistent "Complete your profile to boost job matching accuracy and enable Autofill" reminder card tied to
a real completion nudge modal.

## 6. Interview question bank (`/interview`, nav marked "NEW")

400+ companies, 9,190+ total questions, "+1,074 last 30 days" freshness stat. Categorized into **FAANG, AI
Frontier, High-Growth** groups, each company card shows total question count + last-updated date (Google
528, Meta 558, OpenAI 533, etc.). Gated behind "Upgrade to Unlock Interview Questions." Has a "+ Contribute
a question" crowdsourcing link.

## 7. Messages

Simple, currently empty on a fresh account — "Your inbox is currently empty. Important notifications will
appear here soon." Not much signal here beyond confirming the surface exists.

## 8. Monetization pattern, observed consistently everywhere

Every AI action (résumé analysis, résumé tailoring, cover letter generation, interview questions) uses the
**same shape**: a small daily-refilling free allowance ("X credits available today"), a clean "Out of
Credits" modal when exhausted (balance shown, honest "come back tomorrow" free path stated explicitly, plus
an "Upgrade to Turbo" CTA) — never a hard wall with no free path. This validates gating our own version with
the existing `lib/usage.ts` daily-cap pattern rather than inventing something new, and matches the honesty
this project already commits to (see `feedback_paid_api_cost_discipline` in cross-session memory).

---

## What's next

Build target right now: the résumé-analysis feature (grade + Urgent/Critical/Optional counts + 3-category
report + per-bullet issue-and-diff drill-down + daily-capped re-analyze).

## 9. Gemini research pass — feature/design finalization (2026-07-30, via agy)

Ran after the scan above, asked for (a) feature ideas beyond a straight clone that fit our premium
"Sniper not Machine Gunner" positioning, and (b) how to resolve JobRight's red/teal diff view against our
strict two-color rule (amber/`--color-accent` = user actions only, teal/`--color-agent` = AI content only).

**Feature ideas (not yet decided/built, for later discussion):**

1. **Strategic Narrative Alignment** — analyze the résumé's macro-story, not just individual bullets: does
   it position the candidate as an executor vs. a strategist, and does that match the seniority of role
   they're targeting? Flags bullets that stay too tactical for a Director-level target, for example.
2. **"Interviewer Skepticism" engine** — flag structural weaknesses a sharp interviewer would probe (vague
   scope in a senior role, unexplained gaps, no visible title progression, metrics without business
   context) as "Vulnerabilities," with suggested clarifying talking points — not just grammar/impact fixes.
3. **10-Dimension Role-Fit Matrix** — reuse our *existing* 10-dimension job-match grading concept for the
   résumé grade itself (Stakeholder Management, Technical Depth, Revenue Impact, etc., scoped to the
   target role archetype) instead of inventing JobRight's generic Relevance/Impact/Style categories from
   scratch — keeps résumé analysis feeling like the same intelligence system as the rest of the app,
   not a bolted-on separate feature.

**Diff-view color resolution (decided direction for whenever we build the per-bullet diff UI):** drop the
red entirely rather than introduce a third semantic color.
- AI-suggested additions → teal (`--color-agent`), consistent with every other AI-generated surface in the
  app.
- Removed/original text → **not red** — muted/neutral strikethrough (`text-muted` at reduced opacity),
  treated as "past state" rather than "error." Keeps the diff calm and premium instead of red-pen grading.
- Any user-facing control (Accept/Discard/the editable "write your own version" box) → amber
  (`--color-accent`), since that's the moment the user is asserting control over the AI's suggestion.

None of this is built yet — captured here so the direction survives to whenever we actually implement the
per-bullet diff view, separate from today's build pass on the grade/report/credit-gating structure.
