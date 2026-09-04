# Research prompt — choosing Apify job-scraping actors

Paste the section below into Gemini / Perplexity. Everything in it is measured
from live test runs on 2026-09-04, not estimated.

---

## What we are building

A job-search product ("Sortie") that competes with JobRight.ai. A candidate
searches a job title + city; we return matching roles, score each one against
their profile with an LLM, and help them apply. Our differentiator is supposed
to be **link authenticity and match quality**, not raw volume.

Benchmark: JobRight returns **111 results** for "Financial Advisor / Toronto",
each card showing freshness ("Reposted 4 hours ago"), applicant count
("< 25 applicants"), alumni connections, seniority, and years of experience.
They publish **8,000,000+ total jobs, 400,000+ added daily**.

## Current architecture

**Live search path** (runs per user search, must return in seconds):
- Currently wired to TWO paid Apify actors only (deliberate isolation test).
- Previously: SerpApi (Google Jobs) → Adzuna → JSearch → JobsPipe → RemoteOK →
  TheirStack → Apify Indeed. All still coded but switched off.

**Background crawl** (our own, free, already built):
- Polls public ATS endpoints directly for ~24,000 known companies.
- Covers 8 platforms: Greenhouse, Lever, Ashby, SmartRecruiters, Workable,
  BambooHR, Workday, iCIMS, Dayforce.
- Has **386,751 cached postings**. Costs $0. Gives the best link quality
  (direct employer ATS URLs).
- Runs on Inngest crons every 15 minutes, batched.

**Downstream pipeline** (all already built):
- Title-relevance filter, city filter, staleness filter (60 days).
- Apply-link trust classifier: ATS > employer > aggregator > indirect >
  low-quality. Low-quality links are hidden outright.
- Canonicalisation/dedup across sources.
- LLM scoring: a cheap "lite" pass over every result (5 jobs per call, global
  12-calls/60s throttle), then a full 10-dimension rubric on demand when a
  candidate opens a job.

## What we measured on Apify (live runs, same query)

| Actor | Results | Time | Price/1k | Apply link | Notable fields |
|---|---|---|---|---|---|
| `kaix/linkedin-jobs-scraper` | 100 | 47s | **$0.10** | LinkedIn URL | 51 fields; applicant count, recruiter, logo, benefits — **but only with `fetchDetails: true`** |
| `valig/linkedin-jobs-scraper` | 68 | 45s | $0.40 | LinkedIn URL | 20 fields |
| `hirebase/job-search` | 9 | **2.5s** | $3.00 | **Direct employer ATS** | 59 fields; real salary ranges, visa sponsorship, staffing-agency flag, SuccessFactors coverage |
| `truefetch/job-search` | 40 (aborted) | 160s+ | $4.50 | mixed | 42 sources but only 3 ATS platforms |
| `borderline/indeed-scraper` | not run | — | $5.00 | — | — |
| `memo23/google-jobs-scraper` | not run | — | $2.50 | — | Google Jobs aggregate, every syndicated apply link |
| `misceres/indeed-scraper` (currently coded) | — | — | $5.00 | — | — |

## The blocking problem we need solved

**`fetchDetails: true` on the LinkedIn actor is where the valuable fields live**
(applicant count, full description, recruiter, benefits). Without it those
fields exist in the schema but return empty — confirmed: 74 rows, 0 applicant
counts.

But with it on, the actor costs **~17 seconds per job**, and Apify's
`run-sync-get-dataset-items` endpoint **times out at ~300 seconds**. Measured:
25 jobs → timed out at 301.3s → **0 results returned**. Only ~15 jobs fit.

So we are choosing between volume (details off) and data richness (details on,
but ~15 jobs max per synchronous call).

## Constraints

- **Budget: $3 remaining.** Apify Free plan = $5/month credits. No $20 plan
  exists; cheapest paid tier is Starter at $29/month, and store-actor charges
  are deducted FROM plan credits, not billed on top.
- Live search should feel fast (target under ~10s).
- We already get ATS/career-site coverage free, so paying again for
  Greenhouse/Lever/Ashby is largely wasted spend.
- Canada-focused today (Toronto), but must generalise to other countries.

## Questions we want answered

1. **Which Apify actor(s) give the best cost-to-value for this specific
   product?** We need volume AND applicant-count/freshness/seniority metadata,
   at minimum total cost. Name specific actors with their pricing.
2. **Is there an actor returning LinkedIn applicant counts WITHOUT a
   17s-per-job detail fetch?** That single field is the main thing we cannot
   currently get affordably.
3. **Should the LinkedIn scrape be async/background rather than synchronous?**
   If so, what is the correct Apify pattern (start run → webhook → fetch
   dataset), and does it change pricing?
4. **Is paying for an ATS/career-site actor (e.g. `hirebase` at $3/1k)
   justified when we already crawl 8 ATS platforms free?** Their value seems to
   be structured salary, visa flags, and platforms we don't cover
   (SuccessFactors). Is that worth 30x the LinkedIn per-result price?
5. **Are there non-Apify alternatives that beat this on cost?** We know of
   Fantastic.jobs ($95/mo, 3M career-site + 11M job-board jobs/month) and
   Techmap ($1 per 1,000 postings; $200–400 per country/month feeds). Is there
   anything cheaper for ~50,000–100,000 jobs/month?
6. **What is the realistic monthly cost** to serve ~1,000 searches/month with
   ~100 relevant results each, with freshness and applicant-count metadata?

Please give specific actor names, exact prices, and reasoning about the
speed/richness tradeoff. Flag any claim you cannot verify from a primary
source — we have been burned before by marketing claims that did not survive
measurement (Adzuna's freshness, Careerjet's "keyless" API).
