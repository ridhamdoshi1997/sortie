# UI Rules

Concise rules for building Sortie (formerly JobPilot) UI. Design assets are available — use them as the source of truth for visual decisions. These rules cover the most important patterns and constraints to keep the UI consistent without over-specifying every detail.

**2026-07-27 reconciliation note:** several sections below (Cards, Typography Hierarchy, Badges, Buttons, Form Inputs, Table, Empty States) had hardcoded hex values left over from a pre-rebrand draft (`#7C5CFC` purple primary button, `#E7EAF3` borders, `#101828` text, `#99A1AF` muted, etc.) that never got updated during the 2026-07-18 Sortie rebrand and directly contradicted `ui-tokens.md`'s actual amber/teal palette — see `ui-tokens.md`'s own "never hardcode hex" Invariant, which this file was itself violating. Rewritten below to reference tokens instead of literal values.

---

## Font

System font stack, per the approved Sortie concept mockup (corrected 2026-07-18 — a same-day rebrand pass had briefly switched to IBM Plex Sans/Mono via `next/font/google`, which was never actually part of the approved design; reverted).

`--font-sans` (body/UI), `--font-mono` (data), and `--font-display` (wordmark + hero heading only) are declared directly in `@theme` in `globals.css` as system-font stacks — no `next/font/google` import needed. `html` picks up `--font-sans` via `@apply font-sans` in the base layer. Use `font-mono` deliberately, not decoratively — it's reserved for scores, timestamps, status, and agent-content labels (see Agent Content below), not general UI text. Use `font-display` only for the wordmark and the hero `<h1>` — never general headings or body text.

---

## Layout

- Page max-width: 1440px, centered
- Main content area padding: 32px on all sides
- Gap between page sections: 24px
- Header height: 64px, full width, white background, padding 0 24px
- All pages use top navbar only — no sidebar, no drawer

---

## Mobile / Responsive

**Added 2026-08-13 (Phase 11)** after a real, user-caught bug: `ResumeManager.tsx`'s résumé list used a plain `<table className="min-w-[640px]">` wrapped in `overflow-x-auto` — on any phone-width screen this forced horizontal scrolling just to reach the row-actions menu ("Sync to Profile" and friends), which was flagged live, not found in review. This is now a standing rule for every new component, not a one-off fix:

- **Never ship a data table/grid as the only layout for a list of real items.** A `<table>` (or a fixed multi-column grid) needs a real mobile alternative — a stacked-card list below `sm:` (`hidden sm:block` on the table, a separate `sm:hidden` card list with the same data and actions) — not just `overflow-x-auto` as the mobile story. `ResumeManager.tsx`'s fix is the reference pattern: same data, same actions (including the row menu), zero horizontal scroll on either layout.
- **If a component renders the same interactive controls twice for two layouts** (e.g. a "..." actions-menu trigger in both a mobile card and a desktop table row for the same item), any shared state driving which one is "open" needs to be tagged by which layout triggered it (see `menuState`'s `view: "mobile" | "desktop"` in `ResumeManager.tsx`) — both layouts render simultaneously in the DOM (one CSS-hidden), so untagged shared state opens the same menu twice at once.
- **Any 2-column split layout** (a workspace with a live preview on one side and tabs/controls on the other, e.g. `ResumeWorkspace.tsx`/`ResumeSlotWorkspace.tsx`'s `lg:grid-cols-[...]`) already collapses to a single stacked column below `lg:` via `grid-cols-1` — keep this pattern for any new workspace-shaped component rather than inventing a new one.
- Check new components at a real 375px viewport width before considering them done, not just at the default desktop preview size.

---

## Navbar

Three nav items: Dashboard, Find Jobs, Profile. Dark ink chrome (`bg-overlay`), per the approved concept mockup — corrected 2026-07-18 (was a plain white bar, which was never actually the approved design).

- Active item: `text-accent`, font-weight 500, 14px
- Inactive item: `text-surface/60`, hover `text-surface`, font-weight 500, 14px
- No underline — active state is color change only
- `Logo` renders with `variant="light"` inside the navbar (see ui-tokens.md)
- Unauthenticated CTA ("Start for free") uses the standard primary button pattern (`bg-accent text-accent-foreground`), not `landing-button-primary` — that class is for light-surface hero/CTA sections, not the dark chrome

---

## Cards

Every content section lives in a card. Flat, not glass — as of 2026-07-27, blur/`backdrop-filter` is reserved exclusively for genuinely floating/sticky chrome (`Navbar`, `JobActionBar`, `FindJobsForm`'s console — see `ui-tokens.md`'s Liquid Glass section), never for an ordinary content card.

```
background: bg-surface
border: border border-border
border-radius: rounded-2xl (16px)
padding: p-6 (24px)
box-shadow: shadow-card
```

Never use colored card backgrounds. Color goes inside cards via badges, bars, and text, never on the card surface itself.

---

## Typography Hierarchy

Three levels used consistently throughout:

**Section headings** — card titles, page section titles

```
font-size: 16px
font-weight: 600
color: text-text-primary
line-height: 24px
```

**Body / primary content text**

```
font-size: 14px
font-weight: 500
color: text-text-primary
line-height: 20px
```

**Secondary / muted text** — labels, timestamps, subtitles

```
font-size: 12px
font-weight: 400
color: text-text-muted
line-height: 16px
```

Stat numbers on dashboard use 30px / weight 600 / `text-text-primary`.

---

## Badges

All badges use `border-radius: 9999px` (pill shape) unless specified otherwise.

```
padding: 2px 8px
font-size: 12px
font-weight: 500
```

Trend badges on stat cards use `border-radius: 4px` (`rounded-sm`, not pill) with `bg-success-lightest` background and `text-success-darker` text.

---

## Buttons

**Primary button:**

```
background: bg-accent
color: text-accent-foreground
border-radius: rounded-md (8px)
padding: px-4 py-2 (16px / 8px)
font-size: 14px
font-weight: 500
```

**Secondary button:**

```
background: bg-surface
border: border border-border
color: text-text-primary
border-radius: rounded-md (8px)
padding: px-4 py-2 (16px / 8px)
```

---

## Form Inputs

```
background: bg-surface
border: border border-border
border-radius: rounded-md (8px)
padding: px-3 py-2 (12px / 8px)
font-size: 14px
color: text-text-primary
placeholder color: text-text-muted
focus: ring-1 ring-accent border-accent
```

---

## Table (Jobs List)

- No alternating row colors — `bg-surface` rows only, separated by border
- Row border: `border-b border-border` between rows
- Column headers: uppercase, 12px, font-weight 500, `text-text-secondary`
- Row text: 14px, `text-text-primary`
- Hover state: `hover:bg-surface-secondary`

---

## Match Score Bar

Inline progress bar shown next to the percentage number.

```
height: 4px
border-radius: 9999px
background track: bg-border-light
```

Fill color by score:

- 80-100%: `bg-success` (green)
- 60-79%: `bg-info` (steel blue)
- Below 60%: `bg-warning` (red-orange)

Score numbers themselves (not the bar) render in `font-mono font-semibold tabular-nums`, colored the same tier — see `FindJobsForm.tsx` job cards for the reference implementation.

---

## Agent Content

Added with the Sortie rebrand (2026-07-18). Any content the AI agent generated — match reasoning, research findings, generated document drafts, interview prep — gets this exact treatment, and nothing else in the app ever does:

```
border-left: 2px solid var(--color-agent)
border-radius: 0 8px 8px 0 (rounded only on the non-border side)
background: bg-agent-light
padding: px-4 py-3
label: font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark, reading "AI Navigator reads" (renamed from "Agent read" 2026-08-17, per direct user request)
body: text-sm text-agent-dark
```

(Corrected 2026-07-18 from `bg-agent-muted`/`text-agent-foreground` — those tokens still exist but are a paler, app-only pair; `bg-agent-light`/`text-agent-dark` match the approved mockup's `radar-tint`/`radar-ink` exactly.)

The point is reliability, not decoration: a user should be able to tell "the AI said this" from the shape alone, without reading a label. That only holds if the treatment is never reused for anything else — don't reach for `border-agent` or `bg-agent-muted` for a regular info callout, warning, or tip. Reference implementations: `MatchScore.tsx` (job details page), `FindJobsForm.tsx` (job cards).

---

## Empty States

Every section that can be empty must have an empty state. Keep it minimal:

- Short descriptive text in `text-text-muted`
- Optional icon above text
- CTA button if there's a logical next action

---

## Tailwind v4 Note

This project uses Tailwind v4. Tokens are defined with `@theme` in globals.css — no `tailwind.config.ts` needed. Never define colors in a config file. Always use `@theme` for new tokens.

---

## Do Nots

- Never use Tailwind's built-in color classes (`bg-purple-500`, `text-gray-600`) — use project tokens only
- Never define colors in `tailwind.config.ts` — use `@theme` in globals.css
- Never add gradients to card backgrounds
- Never use more than one font weight in a single UI element
- Never show raw error messages to users — always show human readable text
- Never stack more than 2 levels of border radius inside each other
- Never use `position: fixed` for UI elements — use normal flow layout
