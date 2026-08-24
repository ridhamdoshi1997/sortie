"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { listUpcomingEvents } from "@/lib/googleCalendar";

type ActionResult = { success: boolean; error?: string };

export async function getGoogleCalendarStatus(): Promise<{ connected: boolean; connectedAt?: string | null }> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data } = await insforge.database
    .from("profiles")
    .select("google_calendar_refresh_token,google_calendar_connected_at")
    .eq("id", user.id)
    .maybeSingle<{ google_calendar_refresh_token: string | null; google_calendar_connected_at: string | null }>();

  return { connected: !!data?.google_calendar_refresh_token, connectedAt: data?.google_calendar_connected_at };
}

export async function disconnectGoogleCalendar(): Promise<ActionResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { error } = await insforge.database
    .from("profiles")
    .update({ google_calendar_refresh_token: null, google_calendar_connected_at: null })
    .eq("id", user.id);

  if (error) {
    console.error("[actions/googleCalendar] disconnectGoogleCalendar", error);
    return { success: false, error: "Failed to disconnect" };
  }

  revalidatePath("/settings");
  return { success: true };
}

export type DetectedInterview = {
  jobId: string;
  jobTitle: string;
  company: string;
  eventSummary: string;
  eventStart: string | null;
};

// Lightweight match, not a general calendar sync: does the event title
// contain this job's company name (case-insensitive)? A user's tracked
// pipeline (build-plan.md §G Google Calendar ingest) is small enough that
// this naive substring check is genuinely sufficient — no NLP needed.
export async function findDetectedInterviews(): Promise<{ success: boolean; error?: string; matches?: DetectedInterview[] }> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("google_calendar_refresh_token")
    .eq("id", user.id)
    .maybeSingle<{ google_calendar_refresh_token: string | null }>();

  if (!profile?.google_calendar_refresh_token) {
    return { success: false, error: "Connect Google Calendar first" };
  }

  const { data: jobs } = await insforge.database
    .from("jobs")
    .select("id,title,company")
    .eq("user_id", user.id)
    .eq("is_hidden", false)
    .not("company", "is", null)
    .returns<{ id: string; title: string | null; company: string | null }[]>();

  const trackedJobs = (jobs ?? []).filter((j) => j.company && j.company.trim().length > 2);
  if (trackedJobs.length === 0) {
    return { success: true, matches: [] };
  }

  const events = await listUpcomingEvents(profile.google_calendar_refresh_token);
  const matches: DetectedInterview[] = [];

  for (const event of events) {
    const summaryLower = event.summary.toLowerCase();
    const job = trackedJobs.find((j) => summaryLower.includes(j.company!.toLowerCase()));
    if (job) {
      matches.push({
        jobId: job.id,
        jobTitle: job.title ?? "Untitled role",
        company: job.company!,
        eventSummary: event.summary,
        eventStart: event.start,
      });
    }
  }

  return { success: true, matches };
}
