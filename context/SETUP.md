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
existing API keys from scratch. If a specific key really is lost, the
comment above that key in `.env`'s own history (check `git log -p` on an
old commit if `.env` itself is never committed, or ask whoever owns that
account) usually says which provider issued it and why.

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
