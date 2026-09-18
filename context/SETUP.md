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

## Step 1.5 — Activate this repo's tracked git hooks (do this on every machine, for every agent)

This repo is worked on from multiple machines and multiple coding agents
(Claude Code, Codex CLI). `.githooks/` is a real, git-tracked hooks
directory — unlike `.claude/`/`.agents/` (gitignored, per-machine
convenience config), these hooks are the same for everyone and travel with
a plain `git clone`. Git still requires one explicit opt-in per machine
before it will run anything from a tracked directory as a hook (a security
boundary, not an oversight):

```bash
git config core.hooksPath .githooks
```

This gives you: a `pre-push` hook that typechecks and lints before
allowing a push (so a broken push can't hand the next machine/agent a
broken build), and `post-merge`/`post-checkout` hooks that flag when
`package.json`/the lockfile changed so you know to `npm install`.
`node scripts/verify-setup.mjs` (next step) checks this is actually set.

## Step 2 — Run the bootstrap check

```bash
node scripts/verify-setup.mjs
```

This reports exactly what's missing: `.env` (and which specific keys are
empty or absent), `.insforge/project.json` (InsForge CLI link),
`.vercel/project.json` (Vercel CLI link), the git `origin` remote, whether
`core.hooksPath` is activated (Step 1.5), and whether your local branch is
behind `origin` (a stale-context check that matters specifically because
this repo is worked from multiple machines/agents — if it's behind, `git
pull` before touching anything, don't trust local state or `RESUME.md`'s
own account of "current" until you have). Re-run it after fixing anything
it flags — it's safe to run as many times as you want, read-only.

**Known gap, not yet fixed**: this env-key checklist and the rest of this
file are still InsForge-centric from before the Supabase migration
(`feature/supabase-migration`). The actual live backend now reads
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL`/
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (via Doppler, same mechanism as everything
else in Step 3) — `context/RESUME.md` is the current source of truth on
backend state; don't treat this file's InsForge framing as still accurate
without cross-checking there first.

## Step 3 — Real credentials, via Doppler (the actual central store, added Phase 40)

`.env`, `.insforge/project.json`, and `.vercel/project.json` are all
intentionally NOT in git (see `.gitignore`) — they hold real API keys and
secrets. A fresh clone starts with none of them. As of Phase 40, there IS a
real central place these live outside git: a Doppler project. Nobody but
the account owner can create it or push the first copy of real secrets
into it — that first upload is a deliberate, human action, not something
an AI session should do automatically, the same way logging into any other
account is.

**Vercel's own environment variable store is NOT a way to retrieve these**
— tried and confirmed wrong live (2026-09-01): `vercel env pull` writes the
literal string `[SENSITIVE]` in place of every "Secret"-type variable's
real value instead of the value itself; only "Config"-type variables
(mostly the `NEXT_PUBLIC_*` ones) actually come back. Vercel's Secret type
is genuinely write-only by design, not a retrievable vault — don't
re-attempt this path, and don't switch keys to "Config" type to work
around it (that trades away real protection for convenience on credentials
that don't need that exposure). Doppler is the actual answer to "where do
these live," not Vercel.

### 3a — One-time initial setup (already done once for this project; only repeat if starting a genuinely new Doppler project from scratch)

1. Create a free account: [dashboard.doppler.com/register](https://dashboard.doppler.com/register)
2. Install the CLI:
   - Windows: `winget install doppler.doppler`
   - macOS: `brew install dopplerhq/cli/doppler`
   - Linux: `curl -Ls https://cli.doppler.com/install.sh | sh`
3. `doppler login` — opens a browser to authenticate this device to the account.
4. `doppler projects create sortie`
5. `doppler setup` — interactive; run from this repo's root, pick the `sortie` project and a config (e.g. `dev`). Writes a local `.doppler.yaml` linking this folder to that project+config (safe to commit — it holds no secrets, just which project/config this folder maps to).
6. Push the real values in — run these yourself, they're the actual secret-transmission step:
   ```bash
   doppler secrets upload .env
   doppler secrets set INSFORGE_PROJECT_JSON="$(cat .insforge/project.json)"
   doppler secrets set VERCEL_PROJECT_JSON="$(cat .vercel/project.json)"
   ```

### 3b — New machine or new account (the real, repeatable path — do this every time, not step 3a)

1. `git clone` this repo (or already have it) and `cd` into it.
2. Install the Doppler CLI (same OS-specific command as step 2 above).
3. `doppler login` — your action, once per device, authenticates to the SAME existing Doppler account (not a new project).
4. `doppler setup` — pick the existing `sortie` project and the right config.
5. Reconstruct the three files:
   ```bash
   doppler secrets download --no-file --format env > .env
   mkdir -p .insforge .vercel
   doppler secrets get INSFORGE_PROJECT_JSON --plain > .insforge/project.json
   doppler secrets get VERCEL_PROJECT_JSON --plain > .vercel/project.json
   ```
6. Run `node scripts/verify-setup.mjs` to confirm everything landed correctly.

Once `doppler login` + `doppler setup` are done on a device, a Claude Code
session in this repo can run either of the commands in step 5 itself, or
run the app directly with secrets injected at runtime with no `.env` file
needed at all: `doppler run -- npm run dev`. No manual copy-pasting of
secrets between machines needed again.

If a specific key really is lost with no backup anywhere (including
Doppler), it has to be regenerated at the source (the provider's own
dashboard — SerpApi, Adzuna, Gemini, etc.) and re-added to `.env`/Doppler
and Vercel; there's no shortcut.

## Step 3c — Files that don't need any of this

Everything else gitignored (`.claude/launch.json`,
`.claude/settings.local.json`, `.impeccable/config.json`) is convenience
only — each recreates itself to a sane default (or the tool that reads it
just prompts again) if it's missing. Not worth storing anywhere.

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

## Step 7.5 — Recreate `.claude/launch.json` (dev server + Inngest Dev Server configs)

`.claude/` is entirely gitignored (per-machine convenience config), so this
file does NOT arrive via `git clone` — it has to be recreated once per
machine. Without it, `preview_start`/"run the dev server" has nothing to
launch, and — separately — background jobs (job evaluation, the crawl
crons, everything in `lib/inngest/functions.ts`) simply won't fire at all
locally, because that needs its own separate running process (the Inngest
Dev Server, a local event router), not just the right env vars. The env
vars (`INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`) are necessary but not
sufficient — `verify-setup` checks those are present, but has no way to
check whether this second process is actually running, since that's
runtime state, not saved configuration.

Create `.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "job_pilot_dev",
      "runtimeExecutable": "doppler",
      "runtimeArgs": ["run", "--project", "sortie", "--config", "dev", "--", "npm", "run", "dev"],
      "port": 3001,
      "autoPort": false
    },
    {
      "name": "inngest_dev",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["--yes", "inngest-cli@latest", "dev", "-u", "http://localhost:3001/api/inngest", "--no-discovery"],
      "port": 8288,
      "autoPort": false
    }
  ]
}
```

`runtimeExecutable: "doppler"` assumes the Doppler CLI is on `PATH` (true
after the standard install in Step 4) — don't hardcode a machine-specific
absolute path here, that was a real bug found and fixed on the first
machine (worked there, would have silently failed anywhere else this file
was copied).

Start both configs (or run `npx inngest-cli@latest dev -u
http://localhost:3001/api/inngest --no-discovery` directly in a second
terminal) if you need background jobs to actually run locally, not just
the app to load — most UI work doesn't need this, but anything touching
job evaluation, the crawl crons, or Inngest functions does.

## Step 8 — Once clean, go read `context/RESUME.md`

That's the actual "what's the state of the product, what's next" doc. This
file is only about whether the environment itself is ready to work in.
