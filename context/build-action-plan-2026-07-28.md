# Build & Action Plan — 2026-07-28

Synthesizes `sortie-strategic-analysis-2026-07-28.md` (competitive/business strategy) and `sortie-design-architecture-analysis-2026-07-28.md` (UI/codebase structure review), both from Gemini 3.1 Pro, cross-checked against `build-plan.md`'s existing Master Feature Inventory and this session's confirmed-live finding that **zero monetization code exists** despite real recurring per-use costs already being spent (Insider Connections ~$0.31/lookup via Apify, Email Lookup ~$0.10/lookup, Perplexity Sonar fallback ~$0.005-0.02/call).

**Positioning locked in by this analysis:** Sortie is "Job Search Intelligence for High-Value Candidates" — the Sniper, not the Machine Gunner. Every item below is filtered through that lens: does it serve a candidate doing deep due diligence on 10-15 roles, or does it serve volume? If the latter, it's in the Skip list, not the Build list.

---

## Phase 0 — Cheap, do immediately (hours, not days)

These are pure liabilities right now — costing nothing to fix, actively hurting the premium/trustworthy read every day they stay as-is.

1. **Remove the ComingSoon nav surface from production** (`/agent`, `/interview`, `/settings`, `/notifications`). Gemini's design review called this a "major red flag" — a serious professional expects a finished tool, not four visible "under construction" signs. Hide the nav links; the routes can stay in the codebase for later, just not linked from production nav.
2. **Gate `/preview/*` behind `NODE_ENV !== 'production'`** — confirmed not yet done; these are dummy-data mockups that must never leak to a real user.
3. **Swap the match-score traffic-light colors** (`--color-success`/`-info`/`-warning`) for a more bespoke tiering — both Gemini passes independently flagged this as the one thing undercutting the premium feel ("reads like standard B2B SaaS"). Cheap: it's a token/usage change in `ui-tokens.md`'s existing Match Score Colors table, not new infrastructure.
4. **Small renames/moves**: `AutoResearchCompany` → a noun-based name (e.g. `CompanyResearchTrigger`); move `GlassCursorGlow` from `shared/` to `ui/` (it's a primitive, not a feature component).

## Phase 1 — Structural refactor + monetization foundation

The "fix the foundation before piling on more features" phase — both a code-health fix and a direct answer to the real burn-rate problem.

1. **Consolidate the `job-details/` action-button sprawl.** Today: `LeadershipTeamButton`, `EmailLookupButton`, `InsiderConnectionsButton`, `AnalyzeResumeFitButton`, `FloatingApplyButton` as five separate bespoke components. Both Gemini passes called this out independently as a "Machine Gunner" data-dump pattern that contradicts Sniper positioning. Target: one curated "Intelligence Brief" section or a single action menu with a "More Actions" overflow, with the fetch logic moved into hooks (`useEmailLookup`, etc.) rather than one component per action.
2. **Abstract the document engine out of `job-details/`.** `DocumentGenerator`, `DocumentChatEditor`, `ResumeFitSection`, `ResumeGapAnalysis` currently live inside the job-details domain but are conceptually standalone (a user should be able to edit their resume from `/resume`, not just from a specific job). Move to a `documents/` or `resume/` domain, decoupled from job ID. This is also the direct prerequisite for Phase 2.
3. **Monetization — Stripe or Razorpay via InsForge, real tiering.** This is the single highest-urgency item from a business standpoint (unprompted from Gemini's first pass: "you don't have a product deficit, you have an existential burn rate crisis"), and InsForge has first-class support for this already (see the `insforge` skill's payments guides) — it's not a from-scratch build.
   - **Free tier:** unlimited saved jobs, basic tracking, a capped number of full 10-dimension evaluations/month, basic resume matching (no generation).
   - **Sortie Pro:** unlimited evaluations, unlimited company dossiers/leadership lookups, full resume/cover-letter generation workspace, a monthly allotment of Insider Connections lookups (sized to keep Apify cost inside the subscription margin).
   - **À la carte "Intel Credits":** top-up path for heavy networkers who exceed their Pro allotment on the expensive Apify-backed lookups specifically.
   - This directly stops real money being spent today with zero revenue recapture.

## Phase 2 — Live Resume Editor Workspace (score-jump changelog)

**The single most-agreed-upon next feature** — independently recommended by both the first ad-hoc Gemini strategy call and the full deep-research pass. Today's flow is *click Generate → receive a PDF*; there's no visible bridge between the 10-dimension evaluator's intelligence and the document itself.

- Live preview pane + "fit to one page."
- **Score-jump + changelog**: re-score after generation, show the user their score moved (e.g. "C → A-, because the Required Skills gap was addressed") — this is what makes the evaluator's value tangible at the moment it matters.
- One-tap refinement chips reusing the existing `DocumentChatEditor` chat pattern.
- Style controls (columns, spacing, section order) — zero AI cost, pure rendering.
- This is already spec'd in detail in `build-plan.md`'s §C1 — reuse that spec rather than re-deriving it; it hasn't changed, just moved up in priority.
- Builds directly on Phase 1's document-engine abstraction.

## Phase 3 — Chrome extension (intelligence overlay, not autofill)

Injects the 10-dimension score and Insider Connections context directly over LinkedIn/Indeed job postings as the user browses — removes the copy-paste-URL friction from external job import without crossing into the explicitly-rejected auto-apply territory. Biggest net-new engineering surface (new packaging/distribution channel entirely), so it comes after the core web app's foundation is tightened, not before.

## Phase 4 — Warm Intro CRM + Deep Interview Prep

Lower urgency, real value, sequenced last:
- **Warm Intro CRM**: lightweight tracker for *conversations* with Insider Connections contacts, not just application status — this is genuinely how senior roles get won, and it's a natural extension of a feature already shipped.
- **Deep Interview Prep**: feed the existing company dossier (already generated) into a mock-interview chat module grounded in the actual company/leadership context, instead of generic interview questions.

---

## Reaffirmed: deliberately NOT building

No change from the existing stance, now reconfirmed by fresh 2026 competitive evidence (JobRight's own auto-apply Agent shipping as beta-quality/inconsistent per live research this session):

- Mass auto-apply / autofill scripts
- Generic one-click AI cover letters
- A native job board (two-sided marketplace cash burn)
- Complex Kanban sub-tasks (Teal already owns this; keep tracking dead simple)

---

## Open decision for the user

This is a real multi-week roadmap, not a single task — confirm before implementation starts:
1. Does the phase order above match your priority, or does monetization (Phase 1.3) need to move earlier/later relative to the structural refactor?
2. Phase 0 is small enough to just start now if you want — worth doing regardless of how the rest of the sequence shakes out.
