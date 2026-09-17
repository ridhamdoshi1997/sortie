# New Session / New Machine / New Agent — Start Here

Paste this as the first message to any new coding-agent session on this
project (Claude Code, Codex CLI, or anything else) — on this machine, on
PC #2, or any future machine. It works regardless of which agent reads it.

---

This is the Sortie repo (`github.com/ridhamdoshi1997/sortie`). It's worked
on from multiple machines and multiple coding agents — never assume you're
the only one who's touched it since you last looked. Before doing anything
else:

1. `git fetch && git status -sb` — if local is behind `origin`, `git pull`
   before touching any file or trusting local state as current.
2. `node scripts/verify-setup.mjs` — read-only, tells you exactly what's
   missing (env vars, CLI links, git hooks) and whether you're in sync
   with origin. Fix whatever it flags before proceeding.
3. If it flagged `core.hooksPath`, run `git config core.hooksPath
   .githooks` — activates the pre-push typecheck/lint gate and
   dependency-drift reminders every other agent/machine already relies on.
4. Read, in this order: `AGENTS.md` (cross-tool project rules — it has a
   "Multi-agent / multi-machine protocol" section, read that part first),
   then `context/SETUP.md` if step 2 flagged anything real, then
   `context/RESUME.md` (the actual "what's the product state, what's
   next" doc — but its own account can be stale if you skipped step 1).
5. Confirm you're on the right branch — ask if unsure which one is
   current; don't assume `main`/`master` is where the active work lives.
6. Before ending your session: commit and push at a natural stopping
   point, even if the task isn't fully done. Update `context/RESUME.md`
   first if you changed real product state. An uncommitted pile of work
   is invisible to whoever/whatever picks this up next.
7. Before anything with a wide blast radius (a schema migration, a
   site-wide refactor, force-pushing, rewriting history): check
   `git log --oneline -20` first for signs of concurrent work.

Everything else — what the product actually does, current priorities,
known issues — lives in the docs above, not in this file. This file is
only about not breaking the handoff between machines/agents.
