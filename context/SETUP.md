# New Machine / New Account Setup

Read this BEFORE `context/RESUME.md` if this is the first time you (or this
Claude session) are opening this project — on a new device, a new Claude
account, or after a fresh `git clone`. If you've already confirmed the
environment is ready (you ran `verify-setup` recently and it was clean),
skip straight to `context/RESUME.md`.

This project's actual code, schema, and history are all in git — they
travel with the repo automatically. What does NOT travel automatically is
everything below: real credentials, and the account-level access needed to
use them. Nothing here can be force-installed by an AI session acting
alone; each step needs a real action from whoever is running the session.

## Step 1 — Install dependencies

```bash
npm install
```

## Step 2 — Run the bootstrap check

```bash
node scripts/verify-setup.mjs
```

This reports exactly what's missing: `.env` (and which specific keys are
empty or absent), `.insforge/project.json` (InsForge CLI link),
`.vercel/project.json` (Vercel CLI link), and the git `origin` remote.
Re-run it after fixing anything it flags — it's safe to run as many times
as you want, read-only.

## Step 3 — Real credentials (`.env`)

`.env` is intentionally NOT in git (see `.gitignore`) — it holds real API
keys and secrets. A fresh clone starts with none of it. Get a copy of the
real `.env` from wherever it's kept outside git (a password manager, secure
note, or copy it directly from the machine that already has it) — there is
no other source for these values; nobody can regenerate someone else's
existing API keys from scratch.

**Vercel's own environment variable store is NOT a way to retrieve these**
— tried and confirmed wrong live (2026-09-01): `vercel env pull` writes the
literal string `[SENSITIVE]` in place of every "Secret"-type variable's
real value instead of the value itself; only "Config"-type variables
(mostly the `NEXT_PUBLIC_*` ones) actually come back. `env ls`/`env pull`
only tell you which KEYS exist, never the values — Vercel's Secret type is
genuinely write-only by design (so a compromised deploy pipeline can't
exfiltrate it), not a retrievable vault. Don't re-attempt this path
expecting a different result, and don't switch existing keys to "Config"
type to work around it — that trades away real protection (Config values
are plainly visible in the dashboard to anyone with project access) for
convenience on credentials that don't need to be that exposed.

If a specific key really is lost with no backup anywhere, it has to be
regenerated at the source (the provider's own dashboard — SerpApi, Adzuna,
Gemini, etc.) and re-added to both `.env` and Vercel; there's no shortcut.

## Step 3b — The other untracked files (see `.gitignore`)

`.env` is the one that matters most, but three more paths are gitignored.
Two are load-bearing enough to transfer directly if you'd rather not
re-run the interactive link commands in Steps 4-5:

- `.insforge/project.json` — contains a real API key inside it (same
  sensitivity as `.env`, treat it that way) — copy it directly, or let
  `npx @insforge/cli link` regenerate it.
- `.vercel/project.json` — projectId/orgId, not itself a secret but needed
  for the Vercel CLI to know which project to target — copy directly, or
  let `npx vercel link` regenerate it.

Everything else gitignored (`.claude/launch.json`,
`.claude/settings.local.json`, `.impeccable/config.json`) is convenience
only — each recreates itself to a sane default (or the tool that reads it
just prompts again) if it's missing. Not worth chasing down.

## Step 4 — InsForge CLI link

```bash
npx @insforge/cli login
npx @insforge/cli link
```

`login` needs the InsForge account credentials for this project (not a
Claude account — a completely separate service). `link` writes
`.insforge/project.json`, which `verify-setup` checks for. See
`AGENTS.md`'s InsForge section for which skills to reach for once this is
linked (`insforge`, `insforge-cli`, `insforge-debug`,
`insforge-integrations`).

## Step 5 — Vercel CLI link

```bash
npx vercel login
npx vercel link
```

Same idea — needs the Vercel account that owns this project's deployments.
Writes `.vercel/project.json`.

## Step 6 — Skills and MCP servers (cannot be automated — a real per-session action)

Claude Code cannot install a skill or authorize an MCP server on your
behalf from inside a session — both require an explicit action in that
session's own settings, done by whoever's running it. What a fresh session
CAN do is tell you what's missing: check the available-skills listing
(shown automatically each session) and the deferred-tools list, and if
`insforge`, `insforge-cli`, `insforge-debug`, or `insforge-integrations`
aren't present, say so explicitly and ask you to install them (via
`find-skills` or your Claude Code plugin/skill settings) rather than
silently working around their absence.

This project's MCP dependencies actually used this session: the InsForge
CLI (npm package, not an MCP server — see Step 4), a Gmail-sending MCP
connector (only if you actually want outbound email sent on your behalf —
confirm which real account it's authenticated to before trusting it, a real
mismatch happened once already this project's history), and the Browser
pane tools (built into Claude Code, no separate setup).

## Step 7 — Confirm you're looking at the right InsForge project

`.insforge/project.json` and `.env`'s `NEXT_PUBLIC_INSFORGE_URL` should
both point at appkey `umhshbx9` (`https://umhshbx9.us-east.insforge.app`) —
this project's one real backend. If a fresh `link` produces a different
appkey, stop and confirm with whoever owns the InsForge account before
running any migration or destructive command against it.

## Step 8 — Once clean, go read `context/RESUME.md`

That's the actual "what's the state of the product, what's next" doc. This
file is only about whether the environment itself is ready to work in.
