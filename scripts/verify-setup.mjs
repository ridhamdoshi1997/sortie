// Read-only environment bootstrap check — see context/SETUP.md for the
// full new-machine/new-account walkthrough this supports. Safe to re-run
// as many times as needed; never modifies anything. Run with:
//   node scripts/verify-setup.mjs
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const problems = [];
const ok = [];

function check(label, pass, detail) {
  (pass ? ok : problems).push({ label, detail });
}

// --- node_modules ---
check("node_modules installed", fs.existsSync(path.join(root, "node_modules")), "run: npm install");

// --- .env presence + required keys ---
const envPath = path.join(root, ".env");
const envExists = fs.existsSync(envPath);
check(".env file exists", envExists, "see context/SETUP.md Step 3 — .env is never in git, copy it from wherever it's kept");

// Every key this codebase actually reads from process.env, grouped by
// what breaks if it's missing — kept in sync manually (a real .env key
// added to the codebase should be added here too), not derived
// automatically, so this stays a deliberate, reviewed list rather than a
// silent moving target.
const REQUIRED_ENV_GROUPS = {
  "InsForge backend (nothing works without this)": [
    "NEXT_PUBLIC_INSFORGE_URL",
    "NEXT_PUBLIC_INSFORGE_ANON_KEY",
    "INSFORGE_API_KEY",
  ],
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

// --- InsForge CLI link ---
const insforgeLinked = fs.existsSync(path.join(root, ".insforge", "project.json"));
check("InsForge CLI linked", insforgeLinked, "run: npx @insforge/cli login && npx @insforge/cli link");
if (insforgeLinked) {
  try {
    const project = JSON.parse(fs.readFileSync(path.join(root, ".insforge", "project.json"), "utf8"));
    const appkey = project.appkey ?? project.appKey;
    check(
      "InsForge project matches expected appkey (umhshbx9)",
      appkey === "umhshbx9",
      appkey ? `linked to a DIFFERENT project: ${appkey} — confirm with the project owner before running anything destructive` : "appkey not found in project.json",
    );
  } catch {
    check("InsForge project.json is valid JSON", false, "re-run: npx @insforge/cli link");
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
