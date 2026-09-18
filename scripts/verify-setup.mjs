// Read-only environment bootstrap check — see context/SETUP.md for the
// full new-machine/new-account walkthrough this supports. Safe to re-run
// as many times as needed; never modifies anything. Run with:
//   node scripts/verify-setup.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const problems = [];
const optional = [];
const ok = [];

function check(label, pass, detail) {
  (pass ? ok : problems).push({ label, detail });
}

// Same shape as check(), but for things that used to be load-bearing
// (InsForge, pre-Supabase-migration) and no longer are for most of the
// app. Reported separately so they never block a fresh setup, but still
// visible for the one narrow feature (account deletion) that genuinely
// still needs InsForge — see the real backend check below for what
// actually gates "does the app run at all" now.
function checkOptional(label, pass, detail) {
  optional.push({ label, pass, detail });
}

// --- node_modules ---
check("node_modules installed", fs.existsSync(path.join(root, "node_modules")), "run: npm install");

// --- the real backend: Supabase, via Doppler (not .env — confirmed live,
// 2026-09, that SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/
// NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY are deliberately
// NOT in the local .env file; they're injected at runtime by `doppler
// run`, same as launch.json's dev script does). Checking .env for these
// would always report them "missing" even on a correctly-configured
// machine, so this queries Doppler directly instead — the only honest way
// to check a secret that's never meant to touch disk as plain .env text.
const SUPABASE_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
try {
  const raw = execSync("doppler secrets download --project sortie --config dev --no-file --format json", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const secrets = JSON.parse(raw);
  const missing = SUPABASE_KEYS.filter((k) => !secrets[k]);
  check(
    "Supabase backend reachable via Doppler (the real backend — nothing works without this)",
    missing.length === 0,
    missing.length > 0 ? `missing in Doppler's sortie/dev config: ${missing.join(", ")} — confirm with the project owner` : "",
  );
} catch (error) {
  const stderr = error?.stderr?.toString?.() ?? "";
  const hint = /not.?found|ENOENT/i.test(String(error?.message))
    ? "Doppler CLI isn't installed — see context/SETUP.md Step 4"
    : /login|not.?logged.?in|unauthorized/i.test(stderr)
      ? "run: doppler login && doppler setup"
      : `run: doppler login && doppler setup (${stderr.trim().split("\n")[0] || "doppler command failed"})`;
  check("Supabase backend reachable via Doppler (the real backend — nothing works without this)", false, hint);
}

// --- .env presence + required keys ---
const envPath = path.join(root, ".env");
const envExists = fs.existsSync(envPath);
check(".env file exists", envExists, "see context/SETUP.md Step 3 — .env is never in git, copy it from wherever it's kept");

// Every key this codebase actually reads from process.env, grouped by
// what breaks if it's missing — kept in sync manually (a real .env key
// added to the codebase should be added here too), not derived
// automatically, so this stays a deliberate, reviewed list rather than a
// silent moving target. InsForge is deliberately NOT in this required
// list anymore — see the optional check below for why.
const REQUIRED_ENV_GROUPS = {
  "AI providers (job evaluation, résumé/cover-letter generation)": [
    "GEMINI_API_KEY",
    "GEMINI_API_KEY_FAST",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
  ],
  "Job search sources": [
    "SERPAPI_KEY",
    "SERPAPI_KEY_FALLBACK",
    "SERPAPI_KEY_FALLBACK_2",
    "ADZUNA_APP_ID",
    "ADZUNA_APP_KEY",
    "THEIRSTACK_API_KEY",
    "OPENWEBNINJA_API_KEY",
    "APIFY_API_TOKEN",
  ],
  "Background jobs (Inngest — job evaluation, crons)": ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"],
  "Admin access": ["ADMIN_EMAILS"],
  "Test account (for live verification, see context/RESUME.md)": ["TEST_ACCOUNT_EMAIL", "TEST_ACCOUNT_PASSWORD"],
};

if (envExists) {
  const envContent = fs.readFileSync(envPath, "utf8");
  // Split on \r?\n, not just \n — a plain \n split left a trailing \r on
  // every line on Windows (CRLF), which broke the regex below entirely:
  // `.` doesn't match \r (it's a line-terminator character in JS regex),
  // so `$` (end of string) could never be reached and NOT ONE key parsed,
  // even though the file was full of valid KEY=VALUE lines. Confirmed via
  // a real, live test against this project's actual .env before shipping
  // the fix — the same "verify before claiming fixed" rule the rest of
  // this project follows.
  const presentKeys = new Map(
    envContent
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );

  for (const [group, keys] of Object.entries(REQUIRED_ENV_GROUPS)) {
    const missing = keys.filter((k) => !presentKeys.get(k));
    check(`.env — ${group}`, missing.length === 0, missing.length > 0 ? `empty/missing: ${missing.join(", ")}` : "");
  }
}

// --- InsForge — legacy, kept as a deliberate revert path (see AGENTS.md /
// RESUME.md). The app migrated to Supabase; every "insforge"-named client
// in the codebase is now a shim wrapping real Supabase (lib/admin/client.ts)
// EXCEPT lib/insforge-admin-sql.ts, which still calls the real InsForge
// backend for exactly one thing: raw-SQL deletion of auth.users rows on
// account deletion (InsForge's REST API has no delete-user endpoint the
// migration replaced yet). Optional unless you're working on that flow —
// never blocks a fresh setup.
const insforgeLinked = fs.existsSync(path.join(root, ".insforge", "project.json"));
checkOptional(
  "InsForge CLI linked (only needed for the account-deletion flow)",
  insforgeLinked,
  insforgeLinked ? "" : "run: npx @insforge/cli login && npx @insforge/cli link",
);
if (insforgeLinked) {
  try {
    const project = JSON.parse(fs.readFileSync(path.join(root, ".insforge", "project.json"), "utf8"));
    const appkey = project.appkey ?? project.appKey;
    checkOptional(
      "InsForge project matches expected appkey (umhshbx9)",
      appkey === "umhshbx9",
      appkey ? `linked to a DIFFERENT project: ${appkey} — confirm with the project owner before running anything destructive` : "appkey not found in project.json",
    );
  } catch {
    checkOptional("InsForge project.json is valid JSON", false, "re-run: npx @insforge/cli link");
  }
}

// --- Vercel CLI link ---
check("Vercel CLI linked", fs.existsSync(path.join(root, ".vercel", "project.json")), "run: npx vercel login && npx vercel link");

// --- git remote ---
try {
  const remotes = execSync("git remote -v", { cwd: root, encoding: "utf8" });
  check("git remote 'origin' configured", /^origin\s/m.test(remotes), "run: git remote add origin <your-repo-url>");
} catch {
  check("git remote check", false, "not a git repository, or git isn't installed");
}

// --- tracked git hooks activated (multi-agent/multi-machine safety net) ---
// .githooks/ is a real, tracked directory (unlike .claude/.agents, which
// are gitignored per-machine config) — this is what makes it possible for
// ANY agent (Claude Code, Codex, a human) on ANY machine to get the same
// pre-push typecheck/lint gate and post-pull dependency-drift reminder,
// automatically, right after a plain `git clone`. It still needs this one
// `git config` pointer per machine (git has no way to auto-trust a
// repo-tracked hooks directory without it — that would let a cloned repo
// execute arbitrary code on checkout, which git deliberately disallows).
try {
  const hooksPath = execSync("git config --get core.hooksPath", { cwd: root, encoding: "utf8" }).trim();
  check(
    "git hooks activated (core.hooksPath)",
    hooksPath === ".githooks",
    hooksPath ? `currently points at "${hooksPath}", expected ".githooks"` : "",
  );
} catch {
  check("git hooks activated (core.hooksPath)", false, "run: git config core.hooksPath .githooks");
}

// --- local git branch in sync with origin ---
// Catches the exact failure mode a multi-agent/multi-PC setup invites: an
// agent starting work from stale local state because nobody pulled first.
// Read-only (a plain `git fetch` never changes tracked files), matching
// this script's own contract.
try {
  execSync("git fetch --quiet", { cwd: root });
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: root, encoding: "utf8" }).trim();
  const counts = execSync(`git rev-list --left-right --count origin/${branch}...HEAD`, { cwd: root, encoding: "utf8" }).trim();
  const [behind, ahead] = counts.split(/\s+/).map(Number);
  check(
    `local branch "${branch}" in sync with origin`,
    behind === 0,
    behind > 0 ? `${behind} commit(s) behind origin/${branch} — run: git pull` : "",
  );
  if (ahead > 0) {
    console.log(`  (ahead of origin/${branch} by ${ahead} commit(s) — push when ready)`);
  }
} catch {
  // No upstream configured yet, or offline — not necessarily a problem
  // (e.g. a brand-new branch that hasn't been pushed), so this doesn't
  // register as a failed check, just silently skips.
}

// --- report ---
console.log(`\n${ok.length} check(s) passed, ${problems.length} problem(s) found.\n`);
if (problems.length > 0) {
  console.log("NEEDS ATTENTION:");
  for (const p of problems) {
    console.log(`  ✗ ${p.label}${p.detail ? ` — ${p.detail}` : ""}`);
  }
  console.log("\nSee context/SETUP.md for the full walkthrough on each of these.");
  process.exitCode = 1;
} else {
  console.log("Environment looks ready. See context/RESUME.md for the actual product state.");
}

const optionalMissing = optional.filter((o) => !o.pass);
if (optionalMissing.length > 0) {
  console.log("\nOptional / legacy (does not block anything above):");
  for (const o of optionalMissing) {
    console.log(`  ○ ${o.label}${o.detail ? ` — ${o.detail}` : ""}`);
  }
}
