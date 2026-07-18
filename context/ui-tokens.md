# UI Tokens

Design tokens for Sortie (formerly JobPilot). All colors, typography, spacing, and component values live in `app/globals.css`. Use these exact values throughout the codebase — never hardcode colors or use raw Tailwind color classes in components.

**Rebrand note (2026-07-18):** the app was renamed from JobPilot to Sortie and the palette moved from a generic purple/white SaaS look to a deliberate "mission console" identity — dark ink chrome, warm amber signal accent, and a teal "agent" accent reserved exclusively for AI-generated content. The token *names* below are unchanged from v1 (`--color-accent`, `--color-success`, etc.) so existing components didn't need to be touched — only their values changed, plus one new semantic role (`--color-agent`) was added. See `context/RESUME.md` for current build status.

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
  --font-sans: "IBM Plex Sans", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;

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

  /* Ink — dark chrome (nav frame, "mission console" hero backgrounds) */
  --color-overlay: #15181d;
  --color-overlay-dark: #0d0f12;

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

Standard pattern (see `MatchScore.tsx` or `FindJobsForm.tsx` job cards for reference implementations):

```tsx
<div className="rounded-r-lg border-l-2 border-agent bg-agent-muted px-4 py-3">
  <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent">
    Agent read
  </p>
  <p className="text-sm text-agent-foreground">{content}</p>
</div>
```

| Element                | Token             |
| ------------------------ | -------------------- |
| Left accent border     | `border-agent`    |
| Tinted background      | `bg-agent-muted` / `bg-agent-light` |
| Label text             | `text-agent` (paired with `font-mono uppercase tracking-wide`) |
| Body text on tint      | `text-agent-foreground` |

### Match Score Colors

Unchanged tiering from v1, new hex values:

| Score Range | Meaning | Token                                  |
| ----------- | ------- | --------------------------------------- |
| 80-100%     | High    | `text-success`                          |
| 60-79%      | Medium  | `text-info`                             |
| Below 60%   | Low     | `text-warning`                          |

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

Font family: **IBM Plex Sans** for headings/body — imported via `next/font/google` in `app/layout.tsx` (weights 400/500/600/700), never a fallback system font. **IBM Plex Mono** for scores, timestamps, status, and agent-content labels (weights 400/500/600) — this is a deliberate, structural typographic choice tied to the "mission console / instrument panel" identity, not decoration; use it anywhere a number or status needs to read as data rather than prose.

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
background: bg-agent-muted
border-radius: 0 8px 8px 0 (rounded-r-lg — never rounded on the accent side, see ui-rules.md)
padding: px-4 py-3
label: font-mono text-[11px] font-semibold uppercase tracking-wide text-agent
body: text-sm text-agent-foreground
```

### Logo / Wordmark

Text-based, not an image (the v1 `public/logo.png` PNG asset is retired):

```tsx
<span className="text-accent">&#9670;</span>
<span className="text-[19px] font-bold tracking-tight">Sortie</span>
```

---

## Invariants

- Never use hex values directly in components — always use CSS variables via Tailwind tokens
- Font is IBM Plex Sans (body/headings) and IBM Plex Mono (data) — always import via `next/font/google`, never a fallback system font
- Never use raw Tailwind color classes like `bg-purple-500` or `text-gray-600` — use project tokens only
- `--accent` (#C9711F) is the signal color — reserved for primary actions and the wordmark, never for AI-generated content
- `--agent` (#2E7D82) is reserved *exclusively* for AI-generated content — never use it for anything else, and never use another color for AI-generated content
- Match score bars always use color tokens based on score range — never hardcoded colors
- LinkedIn badge always uses `--linkedin` (#0A66C2) — never generic blue
- All borders default to `--border` (#D8DBD6) — never use `border-gray-*`
- Numbers that represent scores, timestamps, or status always render in `font-mono` with `tabular-nums`
