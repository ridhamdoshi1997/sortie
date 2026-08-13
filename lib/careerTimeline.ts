import type { Education, Profile, WorkExperience } from "@/types";
import type { AccomplishmentRow } from "@/actions/accomplishments";
import { STATUS_LABELS } from "@/lib/applicationStatus";

// Epoch-based restructure of /career (Phase 11) — a flat, equal-weight
// timeline was the wrong shape for career data: a career is epoch-based,
// accomplishments belong INSIDE the role they happened during, not floating
// independently next to it. Real research finding (agy, 2026-08-13, logged
// in build-plan.md §E), not a guess. Only work-experience roles get
// accomplishments nested — education entries have no start/end range to
// test containment against (just a single graduation_year), so they stay a
// simple flat list alongside the role epochs rather than a false nesting.

export type CareerEpoch = {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  responsibilities: string | null;
  accomplishments: AccomplishmentRow[];
};

export type EducationEntry = {
  id: string;
  title: string;
  subtitle: string | null;
  sortDate: string;
};

export type JobOutcomeRow = {
  id: string;
  title: string | null;
  company: string | null;
  application_status: "draft" | "applied" | "interviewing" | "offered" | "rejected";
  application_status_updated_at: string | null;
  found_at: string;
};

export type JobOutcomeEntry = {
  id: string;
  title: string;
  subtitle: string | null;
  sortDate: string;
};

function toEpochId(role: WorkExperience): string {
  return `${role.company}-${role.title}-${role.start_date}`;
}

// A role's effective end for containment purposes — an ongoing role's range
// extends through today, so an accomplishment logged right now always nests
// correctly under whichever role is current.
function effectiveEnd(role: WorkExperience): string {
  if (role.is_current) return new Date().toISOString().slice(0, 10);
  return role.end_date ?? role.start_date;
}

function dateWithinRange(date: string, start: string, end: string): boolean {
  const d = new Date(date).getTime();
  return d >= new Date(start).getTime() && d <= new Date(end).getTime();
}

export function buildCareerEpochs(
  profile: Pick<Profile, "work_experience"> | null,
  accomplishments: AccomplishmentRow[],
): { epochs: CareerEpoch[]; unassigned: AccomplishmentRow[] } {
  const roles = [...(profile?.work_experience ?? [])].sort(
    (a, b) => new Date(effectiveEnd(b)).getTime() - new Date(effectiveEnd(a)).getTime(),
  );

  const epochs: CareerEpoch[] = roles.map((role) => ({
    id: toEpochId(role),
    title: role.title,
    company: role.company,
    startDate: role.start_date,
    endDate: role.is_current ? null : role.end_date,
    isCurrent: role.is_current,
    responsibilities: role.responsibilities || null,
    accomplishments: [],
  }));

  const unassigned: AccomplishmentRow[] = [];

  for (const accomplishment of accomplishments) {
    // Reverse-chronological role order means an ambiguous overlap (a side
    // role alongside a main job, both spanning the same dates) resolves to
    // the more recent one — a reasonable default, not something users are
    // expected to hit often.
    const matchIndex = roles.findIndex((role) =>
      dateWithinRange(accomplishment.date, role.start_date, effectiveEnd(role)),
    );
    if (matchIndex === -1) {
      unassigned.push(accomplishment);
    } else {
      epochs[matchIndex].accomplishments.push(accomplishment);
    }
  }

  return { epochs, unassigned };
}

export function buildEducationEntries(profile: Pick<Profile, "education"> | null): EducationEntry[] {
  return (profile?.education ?? [])
    .filter((edu: Education) => edu.institution || edu.degree)
    .map((edu: Education) => ({
      id: `${edu.institution}-${edu.degree}-${edu.graduation_year}`,
      title: [edu.degree, edu.field].filter(Boolean).join(", ") || "Education",
      subtitle: edu.institution,
      sortDate: edu.graduation_year ? `${edu.graduation_year}-01-01` : "1900-01-01",
    }))
    .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
}

export function buildJobOutcomeEntries(jobOutcomes: JobOutcomeRow[]): JobOutcomeEntry[] {
  return jobOutcomes
    .map((job) => ({
      id: job.id,
      title: `${STATUS_LABELS[job.application_status]} — ${job.title ?? "Untitled role"}`,
      subtitle: job.company,
      sortDate: job.application_status_updated_at ?? job.found_at,
    }))
    .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
}

// Freshness nudge now checks the most recent event across every source
// (epochs' own accomplishments, unassigned ones, and job outcomes) instead
// of a single flat list's first entry — same 60-day threshold precedent as
// lib/jobStatus.ts's STALE_AFTER_DAYS.
export function mostRecentActivityDate(
  epochs: CareerEpoch[],
  unassigned: AccomplishmentRow[],
  jobOutcomes: JobOutcomeEntry[],
): string | null {
  const dates = [
    ...epochs.flatMap((e) => e.accomplishments.map((a) => a.date)),
    ...unassigned.map((a) => a.date),
    ...jobOutcomes.map((j) => j.sortDate),
  ];
  if (dates.length === 0) return null;
  return dates.reduce((latest, d) => (new Date(d).getTime() > new Date(latest).getTime() ? d : latest));
}
