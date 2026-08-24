<div align="center">
  <br />

  <div>
<img src="https://img.shields.io/badge/-Next.js-black?style=for-the-badge&logo=Next.js&logoColor=white" />
<img src="https://img.shields.io/badge/-TypeScript-3178C6?style=for-the-badge&logo=TypeScript&logoColor=white" />
<img src="https://img.shields.io/badge/-Tailwind%20CSS-06B6D4?style=for-the-badge&logo=Tailwind%20CSS&logoColor=white" />
<img src="https://img.shields.io/badge/-shadcn%2Fui-000000?style=for-the-badge&logo=shadcnui&logoColor=white" />
<br />
<img src="https://img.shields.io/badge/-Gemini%20%7C%20GPT--4o%20%7C%20Claude-412991?style=for-the-badge" />
<img src="https://img.shields.io/badge/-Stagehand-orange?style=for-the-badge" />
<img src="https://img.shields.io/badge/-Browserbase-000000?style=for-the-badge" />
<img src="https://img.shields.io/badge/-InsForge-darkgreen?style=for-the-badge" />

  </div>

  <h3 align="center">Sortie — your career operations command center</h3>

  <div align="center">
    Scan the field, score what's worth your time, and land with a file on every target.
  </div>
</div>

## 📋 Table of Contents

1. ✨ [Introduction](#introduction)
2. ⚙️ [Tech Stack](#tech-stack)
3. 🔋 [What it does](#features)
4. 🤸 [Quick Start](#quick-start)

## <a name="introduction">✨ Introduction</a>

Sortie is a full-stack AI career-ops tool: it discovers jobs across multiple sources, grades each one against your real profile on a 10-dimension A–F rubric, researches the company behind it, and helps you carry that intelligence all the way through interviews, negotiation, and a portable long-term career record — not just a single job search.

It deliberately does **not** auto-apply or mass-autofill applications. The product's whole point is aiming carefully at a shortlist worth your time, not spraying applications everywhere.

Sortie began as a fork of a JavaScript Mastery tutorial project (`adrianhajdin/job_pilot`) but has since been rebuilt into a distinct product with its own name, design system, and feature set — nothing from that original scope is still an accurate description of what's here today.

## <a name="tech-stack">⚙️ Tech Stack</a>

- **[Next.js](https://nextjs.org/)** — App Router, Server Actions, and API Routes for the full-stack UI.
- **[TypeScript](https://www.typescriptlang.org/)** — strict types across the codebase.
- **[Tailwind CSS](https://tailwindcss.com/)** + **[shadcn/ui](https://ui.shadcn.com/)** — the design system, driven entirely by design tokens (see `context/ui-tokens.md`).
- **[InsForge](https://insforge.dev/)** — Postgres database, auth (Google/GitHub OAuth), storage, and row-level security.
- **Multi-provider AI router** — Gemini, GPT-4o, Claude, and OpenRouter behind one interface (`lib/models.ts`), user-selectable per feature.
- **[SerpApi](https://serpapi.com/)** — primary job-discovery source (Google Jobs), with fallback account chaining.
- **[Stagehand](https://github.com/browserbase/stagehand)** on **[Browserbase](https://www.browserbase.com/)** — AI-driven headless browsing for company research.
- **[Inngest](https://www.inngest.com/)** — background jobs and scheduled crons (e.g. the weekly AI briefing).
- **[PostHog](https://posthog.com/)** — product analytics.
- **[Resend](https://resend.com/)** — transactional email.

## <a name="features">🔋 What it does</a>

👉 **Multi-source job discovery** — searches across configured sources and normalizes results into one pipeline, with dedup and staleness checks.

👉 **10-dimension AI evaluation** — every job is graded A–F across ten fixed dimensions with a one-line justification each, plus matched/missing skills against your real profile.

👉 **Deep company research** — an AI browser agent visits a company's public pages and builds a structured dossier (overview, tech stack, culture, why the role exists, interview talking points).

👉 **Document generation** — tailored ATS resumes and cover letters generated from your profile and the specific job, with an AI co-pilot chat for revisions, plus PDF/DOCX/Markdown export.

👉 **Application tracking ("Missions")** — a Kanban + list pipeline across the full lifecycle, from saved through applied, interviewing, offered, or rejected.

👉 **Interview & negotiation prep** — predicted behavioral and technical questions, STAR-shaped answers pulled from your own story bank, and negotiation scripts built from a leverage synthesis.

👉 **Career OS** — a portable, own-your-data career timeline that outlives any single job search: promotion/review prep, an always-warm resume, and a private "why I left" log.

👉 **Navigator** — a global AI copilot available throughout the app for ad hoc questions grounded in your real data.

This list is intentionally a summary, not the full inventory — see `context/build-plan.md`'s Master Feature Inventory for the complete, currently-tracked feature map, and `context/RESUME.md` for what's actually shipped right now.

## <a name="quick-start">🤸 Quick Start</a>

**Prerequisites**

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/en)
- [npm](https://www.npmjs.com/)

**Clone and install**

```bash
git clone https://github.com/ridhamdoshi1997/sortie.git
cd sortie
npm install
```

**Environment variables**

Create a `.env` in the project root. These are the variables the app reads (get real values from each provider's own dashboard — InsForge, SerpApi, Google AI Studio/OpenAI/Anthropic/OpenRouter, Browserbase, PostHog, Resend, Inngest, Apify):

```env
NEXT_PUBLIC_INSFORGE_URL=
NEXT_PUBLIC_INSFORGE_ANON_KEY=
INSFORGE_API_KEY=

NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
PERPLEXITY_API_KEY=

SERPAPI_KEY=
SERPAPI_KEY_FALLBACK=
SERPAPI_KEY_FALLBACK_2=
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
APIFY_API_TOKEN=

BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=

INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

RESEND_API_KEY=

NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

ADMIN_EMAILS=
```

**Run it**

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) (see `package.json`'s `dev` script for the port) in your browser.

**Deploying**

Deployed via the [Vercel Platform](https://vercel.com/). After any deploy that touches scheduled functions, re-sync Inngest with `curl -X PUT <your-deployment-url>/api/inngest`.
