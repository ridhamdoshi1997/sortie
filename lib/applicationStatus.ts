// Shared application-pipeline stage logic — single source of truth for the
// draft/applied/interviewing/offered/rejected union and its display treatment.
// Previously duplicated as three independent local copies (types/index.ts,
// app/resume/page.tsx, components/profile/ApplicationDocumentsCard.tsx);
// consolidated here so the Kanban board and every existing display site
// render the exact same labels/colors.

import type { Job } from "@/types";

export type ApplicationStatus = Job["application_status"];

// Render order for the Kanban board's columns.
export const STAGE_ORDER: ApplicationStatus[] = [
  "draft",
  "applied",
  "interviewing",
  "offered",
  "rejected",
];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offer",
  rejected: "Rejected",
};

// Same token pairing pattern used everywhere else in this app for status-ish
// badges (bg-X-light / text-X-foreground) — agent-teal for "interviewing"
// since that's the active/in-motion state, not because it's AI content.
export const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  draft: "bg-surface-secondary text-text-muted",
  applied: "bg-info-light text-info-foreground",
  interviewing: "bg-agent-light text-agent-dark",
  offered: "bg-success-lightest text-success-foreground",
  rejected: "bg-error/10 text-error",
};
