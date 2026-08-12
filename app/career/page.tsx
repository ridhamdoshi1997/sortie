export const dynamic = "force-dynamic";

import { Download } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { CareerTimeline, type TimelineEntry } from "@/components/career/CareerTimeline";
import { STATUS_LABELS } from "@/lib/applicationStatus";
import type { AccomplishmentRow } from "@/actions/accomplishments";
import type { Profile } from "@/types";

type JobOutcomeRow = {
  id: string;
  title: string | null;
  company: string | null;
  application_status: "draft" | "applied" | "interviewing" | "offered" | "rejected";
  application_status_updated_at: string | null;
  found_at: string;
};

function buildTimeline(
  profile: Pick<Profile, "work_experience" | "education"> | null,
  accomplishments: AccomplishmentRow[],
  jobOutcomes: JobOutcomeRow[],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const role of profile?.work_experience ?? []) {
    entries.push({
      id: `${role.company}-${role.title}-${role.start_date}`,
      kind: "work_experience",
      sortDate: role.is_current ? new Date().toISOString().slice(0, 10) : role.end_date ?? role.start_date,
      title: role.title,
      subtitle: role.company,
      description: role.responsibilities || null,
      tags: [],
    });
  }

  for (const edu of profile?.education ?? []) {
    if (!edu.institution && !edu.degree) continue;
    entries.push({
      id: `${edu.institution}-${edu.degree}-${edu.graduation_year}`,
      kind: "education",
      sortDate: edu.graduation_year ? `${edu.graduation_year}-01-01` : "1900-01-01",
      title: [edu.degree, edu.field].filter(Boolean).join(", ") || "Education",
      subtitle: edu.institution,
      description: null,
      tags: [],
    });
  }

  for (const row of accomplishments) {
    entries.push({
      id: row.id,
      kind: "accomplishment",
      sortDate: row.date,
      title: row.title,
      subtitle: null,
      description: row.description,
      tags: row.tags,
      accomplishment: row,
    });
  }

  for (const job of jobOutcomes) {
    entries.push({
      id: job.id,
      kind: "job_outcome",
      sortDate: job.application_status_updated_at ?? job.found_at,
      title: `${STATUS_LABELS[job.application_status]} — ${job.title ?? "Untitled role"}`,
      subtitle: job.company,
      description: null,
      tags: [],
    });
  }

  return entries.sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
}

// Soft nudge, not a fabricated notification system — plain text only,
// matching this app's established honesty-in-UI rule (see JobActionBar's
// posted_at/found_at gotcha for why this app never invents a false-fresh
// signal). 60 days chosen to match lib/jobStatus.ts's STALE_AFTER_DAYS
// precedent for "this has gone quiet" thresholds.
function freshnessNudge(entries: TimelineEntry[]): string | null {
  if (entries.length === 0) return null;
  const mostRecent = entries[0].sortDate;
  const daysSince = Math.floor((Date.now() - new Date(mostRecent).getTime()) / (24 * 60 * 60 * 1000));
  if (daysSince < 60) return null;
  return "It's been a while since you added anything here — even a small win is worth logging.";
}

export default async function CareerPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const [{ data: profile }, { data: accomplishments }, { data: jobOutcomes }] = await Promise.all([
    insforge.database
      .from("profiles")
      .select("work_experience,education")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "work_experience" | "education">>(),
    insforge.database
      .from("accomplishments")
      .select("id,title,description,date,tags,related_job_id,source,created_at,updated_at")
      .eq("user_id", user.id)
      .order("date", { ascending: false }),
    insforge.database
      .from("jobs")
      .select("id,title,company,application_status,application_status_updated_at,found_at")
      .eq("user_id", user.id)
      .neq("application_status", "draft")
      .order("application_status_updated_at", { ascending: false }),
  ]);

  const entries = buildTimeline(
    profile,
    (accomplishments ?? []) as AccomplishmentRow[],
    (jobOutcomes ?? []) as JobOutcomeRow[],
  );
  const nudge = freshnessNudge(entries);

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              Career Record
            </h1>
            <p className="text-base text-text-secondary sm:text-lg">
              Your own career history — kept whether or not you&apos;re actively job hunting.
            </p>
          </div>
          <a
            href="/api/career/export"
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <Download className="h-4 w-4" />
            Download your career record
          </a>
        </div>

        {nudge && (
          <div className="rounded-r-lg border-l-2 border-warning bg-warning/10 px-4 py-3">
            <p className="text-sm text-warning">{nudge}</p>
          </div>
        )}

        <CareerTimeline entries={entries} />
      </main>
    </>
  );
}
