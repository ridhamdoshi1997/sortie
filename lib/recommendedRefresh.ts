// How long the Recommended tab's list stays fresh before the tab refreshes it
// on its own — once a day, per direct user instruction (2026-09-10).
//
// Its own module so the server's staleness check at render
// (app/jobs/recommended/page.tsx) and the client's check for a tab left open
// (FindJobsForm.tsx) share one number. It cannot live in FindJobsForm itself:
// every export of a "use client" module reaches a Server Component as a client
// reference, not as the value.
export const RECOMMENDED_REFRESH_MS = 24 * 60 * 60 * 1000;
