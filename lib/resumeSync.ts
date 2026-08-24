// Split out of actions/resumes.ts — a "use server" file can only export
// async functions (real Next.js constraint, not just a lint nit: it throws
// at dev-server module-evaluation time, "found object"), so this constant
// array can't live there even though it's conceptually part of that module.
export const SYNC_SECTIONS = [
  "Personal",
  "Professional",
  "Education",
  "Certifications",
  "Work Experience",
  "Preferences",
] as const;

export type SyncSection = (typeof SYNC_SECTIONS)[number];
