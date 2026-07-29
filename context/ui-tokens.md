# UI Tokens

Design tokens for Sortie (formerly JobPilot). All colors, typography, spacing, and component values live in `app/globals.css`. Use these exact values throughout the codebase — never hardcode colors or use raw Tailwind color classes in components.

**Rebrand note (2026-07-18):** the app was renamed from JobPilot to Sortie and the palette moved from a generic purple/white SaaS look to a deliberate "mission console" identity — dark ink chrome, warm amber signal accent, and a teal "agent" accent reserved exclusively for AI-generated content. The token *names* below are unchanged from v1 (`--color-accent`, `--color-success`, etc.) so existing components didn't need to be touched — only their values changed, plus one new semantic role (`--color-agent`) was added. See `context/RESUME.md` for current build status.

**Liquid Glass material (2026-07-24), retired from content cards (2026-07-27):** a translucent, Apple-inspired glass material was layered on every content card app-wide — job cards, qualification panels, dashboard widgets. Live computed-style research against Apple's own macOS Tahoe marketing page, Linear, Vercel, and Raycast showed all four reserve blur/glass for floating chrome only (sticky nav, headers) and use flat surfaces + hairline borders for ordinary content, with dark backgrounds much closer to near-black than this app's original dark-mode values. Content cards were reverted to plain flat `border border-border bg-surface shadow-card` utilities (no custom class needed); glass stays only on genuinely floating/sticky chrome (`Navbar`, `JobActionBar`, `FindJobsForm`'s console). See the "Liquid Glass" section below for the current, narrower scope and the Lightning CSS gotchas that still apply to the chrome classes that remain.

**Dark mode + a serious pre-existing bug found while building it (2026-07-18):** a light/dark theme toggle was added (`next-themes`, `components/layout/ThemeToggle.tsx`, rendered in `Navbar.tsx`). While verifying it live, `--color-accent`/`--color-background`/`--color-border`/`--font-sans`/`--radius-sm through --radius-xl` were found to have been silently resolving to shadcn's generic scaffold values (`var(--accent)`, `var(--background)`, etc. — pale oklch grays and a fallback font stack), **not this app's real design tokens**, since the original rebrand. Cause: `app/globals.css`'s leftover shadcn `@theme inline { }` block redeclared those same theme keys, and Tailwind v4 keeps only one `:root` declaration per key when a name exists in both a plain `@theme` block and an `@theme inline` block — the inline one wins outright, it is not a normal CSS cascade you can out-specificity. This was invisible in light mode purely by coincidence (shadcn's default oklch grays and this app's actual paper/border hex are both pale neutrals, and shadcn's default accent gray vs. this app's amber look different but nobody had directly compared `text-accent`'s rendered color against the intended hex — the diamond wordmark mark, "Start for free" button, and all `border-border` usage across the *entire app* were rendering shadcn defaults, not Sortie's palette). Dark mode made it obvious immediately (accent turned pale gray instead of amber, background stayed white instead of going dark). Fixed by removing the colliding key redeclarations from `@theme inline`, keeping only the genuinely non-colliding shadcn primitive tokens (sidebar, chart, ring, input, destructive, muted, secondary, primary, popover, card, foreground) that this app's components don't otherwise use. See the `@theme inline` block's own comment in `globals.css` for the full explanation — treat it as load-bearing documentation, not a comment to tidy away.

---

## How to Use

This project uses **Tailwind CSS v4**. All design tokens are defined using the `@theme` directive in `app/globals.css`. No `tailwind.config.ts` needed for colors or tokens.

Tailwind v4 automatically generates utility classes from `@theme` variables:

- `--color-accent` → `bg-accent`, `text-accent`, `border-accent`
- `--color-surface` → `bg-surface`, `text-surface`, `border-surface`

```tsx
// Correct — uses generated utility classes
className="bg-surface text-text-primary border-border"

// Also correct — references CSS variable directly
style={{ color: 'var(--color-text-primary)' }}

// Never — hardcoded hex values
className="bg-[#F6F7FB] text-[#101828]"

// Never — raw Tailwind color classes
className="bg-purple-500 text-gray-600"
```

---

## globals.css — Complete Token Definition

```css
@theme {
  --font-sans: -apple-system, "Segoe UI", Roboto, ui-sans-serif, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace;
  --font-display: "Avenir Next", "Century Gothic", "Segoe UI Semibold", ui-sans-serif, sans-serif;

  /* Page and surface backgrounds — cool-neutral "paper", not warm cream */
  --color-background: #f3f4f2;
  --color-surface: #ffffff;
  --color-surface-secondary: #eaebe7;
  --color-surface-tertiary: #f7f7f5;
  --color-surface-muted: #eef0ec;

  /* Borders */
  --color-border: #d8dbd6;
  --color-border-light: #e4e6e2;
  --color-border-muted: #dcded9;

  /* Text */
  --color-text-primary: #15181d;
  --color-text-secondary: #565c56;
  --color-text-muted: #8a8f89;
  --color-text-dark: #2c3129;
  --color-text-darker: #1e211c;
  --color-text-darkest: #15181d;
  --color-text-black: #0d0f0c;
  --color-text-slate: #2c3129;
  --color-text-slate-medium: #565c56;

  /* Signal — primary accent. Reserved for primary actions and the
     wordmark. Never used for AI-generated content. */
  --color-accent: #c9711f;
  --color-accent-dark: #7a4713;
  --color-accent-light: #f4e3d0;
  --color-accent-muted: #faf1e6;
  --color-accent-foreground: #1c1204;

  /* Radar — reserved exclusively for content the AI agent generated
     (match reasoning, research findings, generated drafts). Never used
     for anything else, so its appearance is a reliable signal on its own. */
  --color-agent: #2e7d82;
  --color-agent-dark: #184a4d;
  --color-agent-light: #dcecec;
  --color-agent-muted: #eef6f6;
  --color-agent-foreground: #0f3436;

  /* Success — green, also the "high match" score tier */
  --color-success: #3f7a4f;
  --color-success-alt: #2f9e5c;
  --color-success-dark: #1f5c33;
  --color-success-darker: #17431f;
  --color-success-light: #e2ede3;
  --color-success-lightest: #eef5ef;
  --color-success-foreground: #1f5c33;

  /* Info — steel blue, also the "medium match" score tier */
  --color-info: #4472a8;
  --color-info-dark: #2b537e;
  --color-info-medium: #3d6699;
  --color-info-light: #dce6ef;
  --color-info-lightest: #eef3f8;
  --color-info-foreground: #2b537e;
  --color-info-muted: #94a2c5;

  /* Warning — muted red-orange, also the "low match" score tier.
     Deliberately distinct from --color-accent (golden amber) so the two
     never get confused despite both being warm hues. */
  --color-warning: #b5502e;
  --color-warning-foreground: #ffffff;

  /* Error */
  --color-error: #a8402f;
  --color-error-foreground: #ffffff;

  /* LinkedIn brand */
  --color-linkedin: #0a66c2;
  --color-linkedin-light: #dce6f1;
  --color-linkedin-foreground: #ffffff;

  /* Ink — dark chrome (nav frame, "mission console" hero backgrounds).
     This chrome stays dark in BOTH light and dark app themes, so its
     content color is a fixed token, not a themed one. */
  --color-overlay: #15181d;
  --color-overlay-dark: #0d0f12;
  --color-overlay-foreground: #ffffff;

  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 14px;
  --radius-full: 9999px;
}
```

Tailwind v4 generates utility classes automatically from every `--color-*` token above.

---

## Color Usage Guide

### Page Layout

| Element           | Token                  |
| ----------------- | ----------------------- |
| Page background   | `bg-background`        |
| Card / surface    | `bg-surface`           |
| Secondary surface | `bg-surface-secondary` |
| Default border    | `border-border`        |
| Light border      | `border-border-light`  |
| Dark chrome (nav frame, hero) | `bg-overlay` / `bg-overlay-dark` |

### Typography

| Element                | Token                           |
| ----------------------- | -------------------------------- |
| Headings, primary text | `text-text-primary` (#15181D)   |
| Secondary text, labels | `text-text-secondary` (#565C56) |
| Placeholder, muted     | `text-text-muted` (#8A8F89)     |
| Dark labels            | `text-text-dark` (#2C3129)      |

### Signal (Primary Accent — warm amber)

Used for: primary buttons, active nav items, the wordmark mark, "tailored" badges, focus rings. Never for AI-generated content — that's the Radar/Agent role below.

| Element                | Token                    |
| ------------------------ | -------------------------- |
| Button background      | `bg-accent`              |
| Button text (dark-on-amber — verified ~5.2:1 contrast) | `text-accent-foreground` |
| Light badge background | `bg-accent-light`        |
| Subtle background      | `bg-accent-muted`        |

### Radar / Agent (AI-Generated Content Marker — teal)

New role, added with the Sortie rebrand. Applied wherever the app is showing the user something the AI produced — match reasoning, research findings, generated document drafts, interview prep. The rule is strict: if it came from the agent, it gets this treatment; if it didn't, it never does. That consistency is what makes it legible as "the AI said this" without a label.

Standard pattern (see `MatchScore.tsx` or `FindJobsForm.tsx` job cards for reference implementations) — **corrected 2026-07-18** to use `bg-agent-light`/`text-agent-dark` (previously `bg-agent-muted`/`text-agent-foreground`), matching the mockup's `radar-tint`/`radar-ink` exactly rather than a paler app-only derived pair:

```tsx
<div className="rounded-r-lg border-l-2 border-agent bg-agent-light px-4 py-3">
  <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
    Agent read
  </p>
  <p className="text-sm text-agent-dark">{content}</p>
</div>
```

| Element                | Token             |
| ------------------------ | -------------------- |
| Left accent border     | `border-agent`    |
| Tinted background      | `bg-agent-light`  |
| Label text             | `text-agent-dark` (paired with `font-mono uppercase tracking-wide`) |
| Body text on tint      | `text-agent-dark` |

`--color-agent-muted`/`--color-agent-foreground` still exist as tokens (a paler, app-only pair) but are no longer part of the canonical Agent Content pattern — don't use them for new Agent Content instances.

### Match Score Colors

**Redesigned 2026-07-28** — the original v1 tiering was a literal green/blue/amber traffic light, flagged by design review as reading like a generic B2B dashboard rather than a premium tool. Every score/grade this applies to (match %, resume fit score, 10-dimension letter grades) is **AI-generated output** — per the Invariants below, `--color-accent` (amber) is reserved for user actions and must never represent AI content, so the "strong" tier uses `--color-agent` (teal, the app's existing AI-content signal) instead of a generic success green. The middle tier is neutral gray, not an "info" blue — an unremarkable-but-fine score isn't a notable event worth its own color. `--color-warning`/`--color-error` are reserved for tiers whose guidance copy is genuinely cautionary (a weak resume-fit score, a D/F evaluation grade, the ghost-listing/below-threshold flags in `MatchScore.tsx`) — never applied just because a score is on the lower end of an otherwise-fine range.

| Score Range | Meaning | Token                                  |
| ----------- | ------- | --------------------------------------- |
| 80-100%     | Strong  | `text-agent-dark` (or `bg-agent`/`bg-agent-light` for badges — see `EvaluationBreakdown.tsx`'s `GRADE_STYLES`) |
| 60-79%      | Middling | `text-text-primary` / `text-text-secondary` (neutral, no color claim) |
| Below 60%   | Weak    | `text-text-muted` (quiet, informational) — or `text-warning`/`text-error` specifically where the copy itself is cautionary (see `ResumeGapAnalysis.tsx`'s `scoreBand`, `EvaluationBreakdown.tsx`'s D/F grades) |

Reference implementations: `components/shared/JobResultCard.tsx`'s `scoreTierClass`, `components/job-details/EvaluationBreakdown.tsx`'s `GRADE_STYLES`, `components/job-details/ResumeGapAnalysis.tsx`'s `scoreBand`.

### Skills Badges

| Type          | Background            | Text                      |
| ------------- | ---------------------- | -------------------------- |
| Matched skill | `bg-success-lightest` | `text-success-foreground` |
| Missing skill | `bg-accent-muted`     | `text-accent`             |

### Source Badges

| Source   | Background             | Text                  |
| -------- | ------------------------ | ------------------------ |
| LinkedIn | `bg-linkedin-light`    | `text-linkedin`       |
| URL      | `bg-surface-secondary` | `text-text-secondary` |

### Status Badges

| Status     | Background             | Text                      |
| ---------- | ------------------------ | -------------------------- |
| Tailored   | `bg-accent-light`      | `text-accent`             |
| High Match | `bg-success-lightest`  | `text-success-foreground` |
| Low Match  | `bg-surface-secondary` | `text-text-secondary`     |

---

## Typography

| Element              | Size | Weight | Line height | Color token           |
| --------------------- | ---- | ------ | ----------- | ----------------------- |
| Logo text (wordmark) | 19px | 700    | 28px        | `text-text-primary`, mark glyph in `text-accent` |
| Stat number           | 30px | 600    | 36px        | `text-text-primary`   |
| Section heading       | 16px | 600    | 24px        | `text-text-primary`   |
| Nav item (active)     | 14px | 500    | 20px        | `text-accent`          |
| Nav item (inactive)   | 14px | 500    | 20px        | `text-text-dark`       |
| Card label             | 14px | 500    | 20px        | `text-text-secondary` |
| Body / activity text  | 14px | 500    | 20px        | `text-text-primary`   |
| Agent-content label (new) | 11px | 600 | mono, uppercase, tracking-wide | `text-agent` |
| Match score number (new) | varies | 600 | mono, tabular-nums | tiered — see Match Score Colors |
| Timestamp / muted     | 12px | 400    | 16px        | `text-text-muted`     |
| Chart axis labels     | 12px | 400    | 15px        | `#8a8f89`               |

**Correction (2026-07-18, same day as the rebrand):** the rebrand pass had switched fonts to IBM Plex Sans/Mono via `next/font/google` — this was never actually part of the approved concept mockup (`context/RESUME.md` links the published artifact), which used a system-font stack throughout. Reverted to match the mockup: `--font-sans` (body/UI) is a system stack (`-apple-system`, `Segoe UI`, `Roboto`), `--font-mono` (scores, timestamps, status, agent-content labels) is a system mono stack (`ui-monospace`, `SF Mono`, `Cascadia Code`, `Consolas`), and a new `--font-display` token (`Avenir Next`, `Century Gothic`, `Segoe UI Semibold`) was added for the wordmark and hero heading only — the one place the mockup used a distinct display face. No `next/font/google` import needed since these are all system-available fallback stacks.

---

## Spacing

| Token       | Value      | Usage                 |
| ----------- | ---------- | ----------------------- |
| `gap-1`     | 4px        | Tight inline gaps     |
| `gap-2`     | 8px        | Badge and tag gaps    |
| `gap-3`     | 12px       | Form field gaps       |
| `gap-4`     | 16px       | Section internal gaps |
| `gap-6`     | 24px       | Between sections      |
| `gap-8`     | 32px       | Page section gaps     |
| `p-4`       | 16px       | Card padding          |
| `p-6`       | 24px       | Large card padding    |
| `px-4 py-2` | 16px / 8px | Button padding        |
| `px-3 py-1` | 12px / 4px | Badge padding         |

---

## Component Tokens

### Cards

```
background: bg-surface
border: 1px solid var(--border)
border-radius: 16px (rounded-2xl in Tailwind)
padding: 24px (p-6)
box-shadow: 0px 1px 3px rgba(0,0,0,0.1), 0px 1px 2px -1px rgba(0,0,0,0.1)
```

### Buttons

**Primary:**

```
background: bg-accent
text: text-accent-foreground
border-radius: rounded-md
padding: px-4 py-2
font-weight: font-medium
```

**Secondary:**

```
background: bg-surface
border: border border-border
text: text-text-primary
border-radius: rounded-md
padding: px-4 py-2
```

**Ghost:**

```
background: transparent
text: text-text-secondary
hover: hover:bg-surface-secondary
border-radius: rounded-md
```

### Input Fields

```
background: bg-surface
border: border border-border
border-radius: rounded-md
padding: px-3 py-2
text: text-text-primary
placeholder: text-text-muted
focus: ring-1 ring-accent
```

On a dark ink surface (mission console hero), use the opacity-modified surface token instead of a new color: `bg-surface/8 border-surface/15 text-surface placeholder:text-surface/40`.

### Badges

```
border-radius: rounded-full
padding: px-2 py-0.5
font-size: text-xs
font-weight: font-medium
```

### Match Score Bar

```
background track: bg-border-light
fill: varies by score range (see Match Score Colors above)
height: 4px
border-radius: rounded-full
```

### Agent-Content Callout (new)

```
border-left: 2px solid var(--color-agent)
background: bg-agent-light
border-radius: 0 8px 8px 0 (rounded-r-lg — never rounded on the accent side, see ui-rules.md)
padding: px-4 py-3
label: font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark
body: text-sm text-agent-dark
```

### Logo / Wordmark

Text-based, not an image (the v1 `public/logo.png` PNG asset is retired). Matches the approved concept mockup: all-caps wordmark in the display font, plus a muted mono "callsign" tag.

```tsx
<span className="text-accent">&#9670;</span>
<span className="font-display text-[19px] font-bold uppercase tracking-wide">Sortie</span>
<span className="font-mono text-[11px] uppercase tracking-widest text-text-muted">SRT · 01</span>
```

`Logo` takes a `variant="dark" | "light"` prop — `"dark"` (default) for light surfaces (`text-text-primary` wordmark, `text-text-muted` tag), `"light"` for the dark ink navbar chrome (`text-overlay-foreground` wordmark, `text-overlay-foreground/50` tag — not `text-surface`, see Dark Mode section below). The mark glyph stays `text-accent` in both variants.

---

## Dark Mode

Added 2026-07-18 via `next-themes` (`attribute="class"`, `defaultTheme="system"`) — `components/layout/ThemeToggle.tsx`, rendered in `Navbar.tsx`. Every `--color-*` token gets a dark-mode override in a `.dark { }` block in `app/globals.css`, sourced from the approved concept mockup's own dark palette where a token maps 1:1, derived elsewhere. This block **must stay unlayered plain CSS** — do not wrap it in `@layer`, for the same cascade-layer reason described in Invariants below.

| Token | Light | Dark |
|---|---|---|
| background | `#f3f4f2` | `#0a0b0d` |
| surface | `#ffffff` | `#101215` |
| border | `#d8dbd6` | `#23262b` |
| text-primary | `#15181d` | `#eceeec` |
| text-secondary | `#565c56` | `#a3aaa3` |
| accent (signal) | `#c9711f` | `#e0913f` |
| agent (radar) | `#2e7d82` | `#4fa8ad` |
| success | `#3f7a4f` | `#6bb47c` |
| info | `#4472a8` | `#6f96c9` |
| warning | `#b5502e` | `#d97e56` |
| error (danger) | `#a8402f` | `#d17263` |
| overlay (ink chrome) | `#15181d` | `#0d0f12` |
| overlay-foreground | `#ffffff` | `#ffffff` (fixed) |

Full table (every surface/text/accent/agent/success/info tier) is in `app/globals.css`'s `.dark { }` block directly — treat that as the source of truth, this table is a quick-reference subset. The background/surface/border rows were retuned 2026-07-27 to a near-black ramp (see the Liquid Glass section below) — `--color-overlay`/`-overlay-dark` were already correctly near-black and were left unchanged; it was specifically the ordinary card/page tokens that were a step too light relative to that.

**`--color-overlay-foreground` exists because `bg-overlay` (the navbar/hero chrome) stays dark in *both* themes** — it's fixed branding, not something that flips to a light chrome in light mode. Content sitting on it (`Navbar.tsx` nav links/icons, `Logo.tsx`'s `variant="light"`, `FindJobsForm.tsx`'s mission-console panel) must use `text-overlay-foreground` / `border-overlay-foreground` / `bg-overlay-foreground`, never `text-surface` / `border-surface` / `bg-surface` — those now have a real, different dark-mode value (a dark surface color, correct for actual cards) and would go dark-on-dark and disappear on the permanently-dark chrome once dark mode is active. This exact bug shipped once during development and was caught in live verification before release — don't reintroduce it.

`components/ui/button.tsx` and `components/ui/input.tsx` had their leftover shadcn `dark:*` utility classes (`dark:bg-input/30`, `dark:border-input`, `dark:aria-invalid:border-destructive/50`, etc.) removed — those referenced shadcn's own raw tokens, not this app's design system, and `tailwind-merge` does not strip a `dark:`-scoped class as a conflict against a plain same-property override at a call site (different conflict group), so they would have activated uncoordinated generic shadcn styling the moment `.dark` was toggled. If shadcn scaffolding is ever added back to either file, re-check for this.

---

## Liquid Glass (2026-07-24, narrowed to chrome-only 2026-07-27)

Apple-inspired translucent material — implemented entirely in `app/globals.css`. Originally applied to every content card app-wide; retuned to match what real "premium" references (Apple's own site, Linear, Vercel, Raycast — verified via live computed styles, not just visual impression) actually do: **glass is chrome-only**, ordinary content cards are flat. Never replaces `--color-accent`/`--color-agent`/etc. — those still render exactly as before on top of a glass or flat surface.

### Classes

| Class | Use | Notes |
| --- | --- | --- |
| *(none — plain utilities)* | Ordinary content cards (Qualification, Benefits, Responsibilities, dashboard/profile/job-details cards) | `border border-border bg-surface shadow-card` directly at the call site, no custom CSS class. `.glass-panel` was retired 2026-07-27 — this is the exact pre-Liquid-Glass pattern, restored. `--shadow-card` is intentionally near-invisible on the near-black dark surfaces; elevation there comes from the background/surface/border gray-step difference, not a shadow (matches Linear/Raycast) |
| `.card-interactive-glow` | Add alongside the plain flat utilities on anything clickable (job result cards) | Renamed from `.glass-panel-interactive` — no longer glass-related, just a hover lift + toned-down cursor-following glow (see below). Never combine with a `hover:border-*`/`hover:shadow-*` Tailwind utility on the same element, see the cascade gotcha below |
| `.glass-panel-strong` | Chrome that must stay legible over scrolling content (`JobActionBar`) | Retuned 2026-07-27: `blur(20px) saturate(150%)`, no brightness boost, no sheen layer, single box-shadow — the references use plain blur with no vibrancy boost at all; this keeps a light touch of saturation without the original's heaviness |
| `.glass-panel-overlay` | Dark ink chrome (`Navbar`, `FindJobsForm`'s mission-console hero) | Tinted from `--color-overlay`, not `--color-surface`; same retuned recipe as `.glass-panel-strong` |
| `.glass-pill` | Small pill-shaped controls sitting on top of an already-glass surface (JobActionBar's Save/Hide buttons) | Lighter blur (8px), no saturate boost — sits on an already-blurred parent, a second full effect pass is visual noise |

### The cursor glow

`.card-interactive-glow`'s hover glow follows the actual cursor position via `--mouse-x`/`--mouse-y` CSS custom properties, set by `components/ui/GlassCursorGlow.tsx` (moved from `components/shared/` 2026-07-28 — it's a primitive, not a feature component; mounted once in `app/layout.tsx`) — a single document-level, rAF-throttled `pointermove` listener using event delegation (`.closest('.card-interactive-glow')`, renamed from `.glass-panel-interactive`), not one listener per card. This remains the app's one genuinely interactive hover touch, now tuned as a subtle accent-tinted highlight rather than a glass sheen (references don't have this exact pattern, so it's tuned by eye against the flat-card baseline).

### The ambient backdrop — simplified to flat, 2026-07-27

The original 2-blob animated drift/breathe backdrop was removed. None of the 4 premium references use an ambient gradient wash at all — they're flat. Once ordinary cards stopped being glass, an animated backdrop had nothing left to show through and was motion for its own sake. Replaced with a single static (no animation), very low-alpha `--color-accent` radial highlight near the top of `body`'s own background — `--color-agent` (teal) stays reserved for its AI-content signal role, not ambient decoration, per the Invariants below.

### Dark mode is bolder, not softer (still applies to the remaining chrome)

The first pass muted dark mode's highlight/glow alpha to avoid it feeling "too bright" — this backfired, making dark mode read as flatter and weaker than light mode. This lesson still applies to the chrome classes that stayed glass; the ambient-backdrop-specific corollary (see above) no longer applies since that's flat now.

### Chrome vs. content — now structural, not just a design guideline

This used to be a stated intent that the implementation didn't fully follow (`.glass-panel` was applied to every content card). As of 2026-07-27 it's enforced by the class list itself: there is no glass class left that a content card could reach for. Real Liquid Glass is used for *controls* (nav bars, floating action bars, buttons) sitting over rich content — never applied uniformly to every piece of content, since heavy glass on large text-dense cards actively hurts readability.

### Deliberately not implemented: true SVG-filter refraction

Real Liquid Glass distorts/refracts content behind it (`feDisplacementMap` SVG filters used as a `backdrop-filter` value), not just blurs it. Researched live before deciding against it: **Chrome-only** (Safari/Firefox ignore the whole `backdrop-filter` declaration if it references an unsupported SVG filter — silent full degradation to a flat, unstyled card, not a graceful fallback), and **expensive to recompute** on any dynamic resize (a full displacement-map rebuild on nearly every shape/size change). For a real product rather than a Chrome-only demo, this app uses the standard, ~97%-supported `blur()`/`saturate()`/`brightness()` trio instead — it covers most of what reads as "glass" without staking every browser's rendering on a non-standard technique.

### Gotcha: Lightning CSS silently drops properties that share a declaration block with a `color-mix()` value

Confirmed **three separate times** while building this system — this will recur on any future glass/gradient work in this file if not read first. Tailwind v4's build (Lightning CSS) auto-generates an `@supports (color: color-mix(in lab, red, red))` fallback block for any declaration using `color-mix()`, splitting the original rule into multiple fragments (a plain-color fallback version + the real `color-mix()` version gated behind `@supports`). This rewrite has, more than once, silently dropped *other, unrelated* properties that shared the same original declaration block:

1. **`backdrop-filter` ordering**: writing the standard `backdrop-filter` property before its `-webkit-backdrop-filter` fallback caused the *standard* property to disappear entirely from the compiled output (only the prefixed one survived) — fixed by always writing `-webkit-backdrop-filter` first, `backdrop-filter` last.
2. **`animation`/`background-size` sharing a block with a `color-mix()`-based `background-image`**: both properties vanished completely from the compiled CSS (confirmed via `getComputedStyle(body).animationName === "none"` despite the rule existing correctly in source) — fixed by moving them into their own separate `body { }` rule, not combined with the `color-mix()`-bearing declarations.

**The practical rule going forward**: after adding any new `color-mix()`-based declaration to a rule that also has other properties, verify the *compiled* output (`curl` the served CSS chunk, or check `getComputedStyle()` in the browser) rather than trusting that source-level correctness survived the build. If a property silently doesn't apply, try isolating it into its own rule before assuming it's a browser/logic bug.

---

## Invariants

- Never use hex values directly in components — always use CSS variables via Tailwind tokens
- Font is a system stack — `--font-sans` (body/UI), `--font-mono` (data), `--font-display` (wordmark/hero heading only) — matching the approved concept mockup; no `next/font/google` import
- Never use raw Tailwind color classes like `bg-purple-500` or `text-gray-600` — use project tokens only
- `--accent` (#C9711F) is the signal color — reserved for primary actions and the wordmark, never for AI-generated content
- `--agent` (#2E7D82) is reserved *exclusively* for AI-generated content — never use it for anything else, and never use another color for AI-generated content
- Match score bars always use color tokens based on score range — never hardcoded colors
- LinkedIn badge always uses `--linkedin` (#0A66C2) — never generic blue
- All borders default to `--border` (#D8DBD6) — never use `border-gray-*`
- Numbers that represent scores, timestamps, or status always render in `font-mono` with `tabular-nums`
- Tailwind v4 only auto-generates `font-*` utilities for the canonical `sans`/`serif`/`mono` theme keys — a custom key like `--font-display` needs a hand-written `.font-display { font-family: var(--font-display); }` class (see `app/globals.css`); it will NOT get a utility class for free the way `--color-*` keys do
- Never re-declare a theme key in `app/globals.css`'s `@theme inline { }` block (the shadcn scaffold bridge) that this app's own `@theme { }` block already defines — Tailwind v4 keeps only one `:root` declaration per key across the two, and the inline one wins outright, silently discarding the app's real token. This exact bug shipped (accent/background/border/font-sans/radius-sm through xl all silently resolved to shadcn defaults for a full day, invisible in light mode) before being caught during dark-mode verification. `@theme inline` in this file has a comment explaining exactly which keys are safe to add there — read it before adding anything new to that block.
- Global element selectors and any new theme-override blocks (like `.dark { }`) in `app/globals.css` must stay inside `@layer base` or stay unlayered plain CSS to consistently beat `@theme`'s layered output — never wrap a theme-override block in `@layer utilities` or `@layer components`, which would put it at the wrong precedence
- Global element selectors in `app/globals.css` (`a`, `button`/`input`/etc., `::selection`) must stay inside `@layer base` — CSS cascade layers mean *any* unlayered rule beats *any* layered rule regardless of specificity, so an unlayered `a { color: inherit }` silently wins over a Tailwind utility class like `text-surface` applied to the same anchor. This caused the navbar wordmark to render invisible (dark-on-dark) until fixed 2026-07-18.
