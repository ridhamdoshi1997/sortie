# Sortie: Strategic Architecture & Design Analysis

This document provides an evaluation of Sortie's current frontend architecture and design system, evaluated against the "Sniper vs Machine Gunner" strategy and its target demographic (senior, serious professionals seeking a premium, trustworthy tool).

## 1. Premium & Trustworthy Assessment

**Verdict: Strong Foundation, with a minor risk.**

The design system fundamentally reads as mature and premium. 
* **The Color Split:** Strictly reserving Amber for user actions and Teal for AI generation is brilliant. It establishes a clear, predictable language of trust—a critical feature for professionals relying on AI for career moves. 
* **The "Raycast/Linear" Aesthetic:** Using near-black dark modes, cool-neutral paper backgrounds, and system fonts aligns perfectly with the tools your target demographic already uses and trusts. 
* **Restrained Blur:** Limiting 'Liquid Glass' blur to floating chrome (nav, action bars) while keeping content cards flat demonstrates mature restraint. Overusing blur is a common hallmark of amateur "dribbble" designs.

**What undercuts it:** 
* **Traffic-Light Match Scores:** Using standard success/info/warning (green/yellow/red) colors for match score tiers can feel cheap, generic, or like a standard enterprise dashboard. For a premium tool, consider a monochromatic scale (opacity/luminance changes of your brand colors) or subtle iconographic cues rather than loud traffic-light colors. 

## 2. Component Organization & Patterns

**Verdict: Beginning to bloat; needs refactoring.**

The `job-details/` directory is getting overloaded (21 components) and mixes structural components with highly specific actions.

* **The "Button" Sprawl:** `AnalyzeResumeFitButton`, `InsiderConnectionsButton`, `LeadershipTeamButton`, `EmailLookupButton`, `FloatingApplyButton`. Creating distinct components for what are essentially just `<Button onClick={fetchData}>` instances leads to pattern divergence. 
* **Naming Inconsistencies:** `AutoResearchCompany` sounds like an action or a hook, not a component. If it's a UI element, it should be a noun (e.g., `CompanyResearchTrigger`).
* **Domain Leaks:** `DocumentGenerator`, `DocumentChatEditor`, `ResumeFitSection`, and `ResumeGapAnalysis` are currently living in `job-details/`. If a user can edit their resume outside the context of a specific job (e.g., in `/resume`), these components belong in a generic `documents/` or `resume/` domain.
* **Primitive Misplacement:** `GlassCursorGlow` is in `shared/`, but given its elemental nature, it belongs in `ui/` alongside your standard interactive primitives.

## 3. Prioritized Improvements for the "Sniper"

1. **Refactor the Action Bar/Buttons (High Priority):** 
   * **Why:** The target customer wants clarity and precision. A screen cluttered with 5-6 different action buttons (`Leadership`, `Email`, `Connections`, `Analyze`, `Apply`) feels chaotic. 
   * **Action:** Consolidate these into a unified command menu or a highly curated `JobActionBar` with a primary action and a neat "More Actions" dropdown. Move the specific button logic into custom hooks (e.g., `useEmailLookup`) rather than bespoke components.
2. **Abstract the Document Engine (High Priority):**
   * **Why:** The core value prop for a serious professional is the artifact generation (resume/cover letter). 
   * **Action:** Move `DocumentGenerator` and `DocumentChatEditor` out of `job-details/` and into a dedicated `features/documents/` folder. Ensure they are decoupled from specific job IDs so they can be reused globally.
3. **Refine the Match Score Visuals (Medium Priority):**
   * **Why:** To elevate the UI from "B2B SaaS" to "Premium Consumer".
   * **Action:** Move away from standard success/warning/error colors for scores and adopt a more sophisticated visual indicator (e.g., a subtle ring, typographic hierarchy, or bespoke iconography).

## 4. Contradictions to 'Sniper' Positioning

**The Feature Clutter:** 
The presence of so many specific "lookup" components (`InsiderConnections`, `LeadershipTeam`, `EmailLookup`) inside the job details suggests a "Machine Gunner" approach—throwing every piece of scraped data at the wall. 
A "Sniper" tool is opinionated. It curates the noise. Instead of giving the user 5 different buttons to find people, a Sniper tool might just have a single, beautifully formatted "Intelligence Brief" section that automatically synthesizes the hiring manager's email, the leadership team, and insider connections into one concise narrative.

## 5. The Placeholder / Coming Soon Surface

**Verdict: Major Red Flag.**

Having a massive surface area of `/agent`, `/interview`, `/settings`, `/notifications`, and `/waitlist` returning `ComingSoon` placeholders is highly detrimental to a premium brand. 

* **The Problem:** Serious professionals are paying for (or investing time in) a finished, trustworthy tool. Empty rooms and "under construction" signs break the illusion of maturity. It signals that the product is a prototype, which contradicts the "premium and trustworthy" requirement.
* **The "Sniper" Solution:** Delete the routes you haven't built. If the interview feature isn't ready, the `/interview` nav link shouldn't exist. Sell the user purely on the features that are polished and functioning today. A tool that does 2 things flawlessly is perceived as much more premium than a tool that does 2 things well and has 5 "Coming Soon" banners.
* **The `/preview/*` routes:** This is a fine pattern for iterative design testing in development, but ensure these are strictly gated behind environment variables (`process.env.NODE_ENV !== 'production'`) so they never leak into the production build.
