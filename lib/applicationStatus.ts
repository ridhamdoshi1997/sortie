// Shared application-pipeline stage logic — single source of truth for the
// draft/applied/interviewing/offered/rejected union and its display treatment.
// Previously duplicated as three independent local copies (types/index.ts,
// app/resume/page.tsx, components/profile/ApplicationDocumentsCard.tsx);
// consolidated here so the Kanban board and every existing display site
// render the exact same labels/colors.

import type { Job } from "@/types";

export type ApplicationStatus = Job["application_status"];

// "inbox" is deliberately NOT in STAGE_ORDER — it's the pre-pipeline landing
// zone every newly-found job starts in (the jobs.application_status DEFAULT,
// see the add-inbox-shortlisted-stages migration), reviewed from its own
// dedicated Inbox view (components/missions/InboxTable.tsx), not the Kanban
// board. "shortlisted" replaces what "draft" used to loosely mean as the
// Kanban's real first column — a job the user has explicitly decided to
// pursue, moved there from the Inbox (or the job detail page's own status
// dropdown, which reuses this same list). Inbox/Pipeline split, direct user
// request — the research behind it: Draft was being used as a dumping
// ground for every found job, not a real "I've decided to pursue this"
// signal, which made both the dashboard Pipeline Funnel and the AI Pipeline
// Strategy Read count untriaged/stale jobs as if they were real backlog.
export const STAGE_ORDER: ApplicationStatus[] = [
  "shortlisted",
  "applied",
  "interviewing",
  "offered",
  "rejected",
];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  inbox: "Inbox",
  shortlisted: "Shortlisted",
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offer",
  rejected: "Rejected",
};

// Same token pairing pattern used everywhere else in this app for status-ish
// badges (bg-X-light / text-X-foreground) — agent-teal for "interviewing"
// since that's the active/in-motion state, not because it's AI content.
export const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  inbox: "bg-surface-secondary text-text-muted",
  shortlisted: "bg-surface-secondary text-text-muted",
  applied: "bg-info-light text-info-foreground",
  interviewing: "bg-agent-light text-agent-dark",
  offered: "bg-success-lightest text-success-foreground",
  rejected: "bg-error/10 text-error",
};
