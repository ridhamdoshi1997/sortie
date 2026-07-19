# UI Rules

Concise rules for building JobPilot UI. Design assets are available — use them as the source of truth for visual decisions. These rules cover the most important patterns and constraints to keep the UI consistent without over-specifying every detail.

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

## Navbar

Three nav items: Dashboard, Find Jobs, Profile. Dark ink chrome (`bg-overlay`), per the approved concept mockup — corrected 2026-07-18 (was a plain white bar, which was never actually the approved design).

- Active item: `text-accent`, font-weight 500, 14px
- Inactive item: `text-surface/60`, hover `text-surface`, font-weight 500, 14px
- No underline — active state is color change only
- `Logo` renders with `variant="light"` inside the navbar (see ui-tokens.md)
- Unauthenticated CTA ("Start for free") uses the standard primary button pattern (`bg-accent text-accent-foreground`), not `landing-button-primary` — that class is for light-surface hero/CTA sections, not the dark chrome

---

## Cards

Every content section lives in a card.

```
background: #FFFFFF
border: 1px solid #E7EAF3
border-radius: 16px
padding: 24px
box-shadow: 0px 1px 3px rgba(0,0,0,0.1), 0px 1px 2px -1px rgba(0,0,0,0.1)
```

Never use colored card backgrounds — always white. Color goes inside cards via badges, bars, and text, never on the card surface itself.

---

## Typography Hierarchy

Three levels used consistently throughout:

**Section headings** — card titles, page section titles

```
font-size: 16px
font-weight: 600
color: #101828
line-height: 24px
```

**Body / primary content text**

```
font-size: 14px
font-weight: 500
color: #101828
line-height: 20px
```

**Secondary / muted text** — labels, timestamps, subtitles

```
font-size: 12px
font-weight: 400
color: #99A1AF
line-height: 16px
```

Stat numbers on dashboard use 30px / weight 600 / color #101828.

---

## Badges

All badges use `border-radius: 9999px` (pill shape) unless specified otherwise.

```
padding: 2px 8px
font-size: 12px
font-weight: 500
```

Trend badges on stat cards use `border-radius: 4px` (not pill) with `#ECFDF5` background and `#009966` text.

---

## Buttons

**Primary button:**

```
background: #7C5CFC
color: #FFFFFF
border-radius: 8px
padding: 8px 16px
font-size: 14px
font-weight: 500
```

**Secondary button:**

```
background: #FFFFFF
border: 1px solid #E7EAF3
color: #101828
border-radius: 8px
padding: 8px 16px
```

---

## Form Inputs

```
background: #FFFFFF
border: 1px solid #E7EAF3
border-radius: 8px
padding: 8px 12px
font-size: 14px
color: #101828
placeholder color: #99A1AF
focus: ring-1 ring-accent border-accent
```

---

## Table (Jobs List)

- No alternating row colors — white rows only, separated by border
- Row border: `1px solid #E7EAF3` between rows
- Column headers: uppercase, 12px, font-weight 500, color `#6A7282`
- Row text: 14px, color `#101828`
- Hover state: `background: #F9FAFB`

---

## Match Score Bar

Inline progress bar shown next to the percentage number.

```
height: 4px
border-radius: 9999px
background track: #E7EAF3
```

Fill color by score:

- 80-100%: `#3F7A4F` (green, `--color-success`)
- 60-79%: `#4472A8` (steel blue, `--color-info`)
- Below 60%: `#B5502E` (red-orange, `--color-warning`)

Score numbers themselves (not the bar) render in `font-mono font-semibold tabular-nums`, colored the same tier — see `FindJobsForm.tsx` job cards for the reference implementation.

---

## Agent Content

Added with the Sortie rebrand (2026-07-18). Any content the AI agent generated — match reasoning, research findings, generated document drafts, interview prep — gets this exact treatment, and nothing else in the app ever does:

```
border-left: 2px solid var(--color-agent)
border-radius: 0 8px 8px 0 (rounded only on the non-border side)
background: bg-agent-light
padding: px-4 py-3
label: font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark, reading "Agent read"
body: text-sm text-agent-dark
```

(Corrected 2026-07-18 from `bg-agent-muted`/`text-agent-foreground` — those tokens still exist but are a paler, app-only pair; `bg-agent-light`/`text-agent-dark` match the approved mockup's `radar-tint`/`radar-ink` exactly.)

The point is reliability, not decoration: a user should be able to tell "the AI said this" from the shape alone, without reading a label. That only holds if the treatment is never reused for anything else — don't reach for `border-agent` or `bg-agent-muted` for a regular info callout, warning, or tip. Reference implementations: `MatchScore.tsx` (job details page), `FindJobsForm.tsx` (job cards).

---

## Empty States

Every section that can be empty must have an empty state. Keep it minimal:

- Short descriptive text in `color: #99A1AF`
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
