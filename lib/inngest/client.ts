import { Inngest } from "inngest";

// Real bug found live (2026-08-30): a fresh preview deployment's
// `PUT /api/inngest` (Inngest's own app-sync handshake) returned
// `{"message":"Branch environment name is unspecified"}` — evaluateJobsAsync
// (and every other Inngest function) never actually registered on preview,
// so scoring stayed stuck at "Scoring…" forever regardless of Vercel's own
// Deployment Protection setting (a separate, already-fixed issue). Inngest's
// Vercel integration is supposed to auto-detect the branch from
// VERCEL_GIT_COMMIT_REF, but this project deploys via the Vercel CLI
// directly (`vercel --yes`), not through Vercel's own Git-push integration —
// confirmed against Inngest's docs that CLI-triggered deploys are exactly
// the case where that auto-detection can silently fail. Explicit override,
// scoped to preview only (VERCEL_ENV is Vercel's own runtime env var,
// "production"/"preview"/"development") — production's Inngest environment
// is intentionally left untouched, since forcing an `env` there would
// reroute it into a branch environment instead of the real Production one.
export const inngest = new Inngest({
    id: "sortie",
    // These will now automatically pick up the values from .env.local
    eventKey: process.env.INNGEST_EVENT_KEY,
    // Falls back to a fixed "preview" string if VERCEL_GIT_COMMIT_REF isn't
    // populated — plausible for the same CLI-deploy reason the auto-
    // detection failed in the first place, and this project's real
    // workflow only ever needs one stable preview bucket, not per-branch
    // isolation, so a fixed value is a safe, sufficient fallback rather than
    // risking `env: undefined` reproducing the exact same registration error.
    ...(process.env.VERCEL_ENV === "preview" ? { env: process.env.VERCEL_GIT_COMMIT_REF || "preview" } : {}),
});