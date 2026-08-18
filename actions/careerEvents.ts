"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { APPLICATION_EVENT_LABELS, COMPENSATION_EVENT_LABELS, INTERVIEW_OUTCOME_LABELS } from "@/lib/careerTimeline";

type ActionResult = { success: boolean; error?: string };

// §Q1 Career Timeline/Graph — plain CRUD over the real per-event history
// tables (application_events/interview_events/compensation_events), zero
// AI, mirrors actions/accomplishments.ts's shape exactly. See
// build-plan.md §Q1 for the full design; career_roles (the
// profiles.work_experience jsonb -> relational migration) is deliberately
// deferred, so compensation_events.career_role_id stays unused for now.

export type ApplicationEventType =
  | "applied"
  | "interview_scheduled"
  | "interview_completed"
  | "offer_received"
  | "rejected"
  | "ghosted"
  | "withdrawn";

export type ApplicationEventRow = {
  id: string;
  job_id: string;
  event_type: ApplicationEventType;
  event_date: string;
  notes: string | null;
  created_at: string;
};

export type InterviewEventOutcome = "pending" | "passed" | "rejected" | "no_show";

export type InterviewEventRow = {
  id: string;
  job_id: string;
  panel_member_id: string | null;
  event_date: string;
  outcome: InterviewEventOutcome | null;
  notes: string | null;
  created_at: string;
};

export type CompensationEventType = "offer" | "raise" | "bonus" | "equity_grant";

export type CompensationEventRow = {
  id: string;
  career_role_id: string | null;
  job_id: string | null;
  event_type: CompensationEventType;
  base_salary: number | null;
  bonus: number | null;
  equity_value: number | null;
  effective_date: string;
  notes: string | null;
  created_at: string;
};

const APPLICATION_EVENT_COLUMNS = "id,job_id,event_type,event_date,notes,created_at";
const COMPENSATION_EVENT_COLUMNS =
  "id,career_role_id,job_id,event_type,base_salary,bonus,equity_value,effective_date,notes,created_at";

export async function listApplicationEvents(): Promise<{
  success: boolean;
  data?: ApplicationEventRow[];
  error?: string;
}> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.database
      .from("application_events")
      .select(APPLICATION_EVENT_COLUMNS)
      .eq("user_id", user.id)
      .order("event_date", { ascending: false });

    if (error) {
      console.error("[actions/careerEvents] listApplicationEvents", error);
      return { success: false, error: "Failed to load your application history" };
    }

    return { success: true, data: (data ?? []) as ApplicationEventRow[] };
  } catch (error) {
    console.error("[actions/careerEvents] listApplicationEvents", error);
    return { success: false, error: "Failed to load your application history" };
  }
}

// Called both directly (a manually-logged event) and from
// actions/jobs.ts's setApplicationStatus (a status-change-triggered event,
// same call shape, optional user note attached).
export async function logApplicationEvent(
  jobId: string,
  eventType: ApplicationEventType,
  notes?: string,
): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database.from("application_events").insert([
      {
        user_id: user.id,
        job_id: jobId,
        event_type: eventType,
        notes: notes || null,
      },
    ]);

    if (error) {
      console.error("[actions/careerEvents] logApplicationEvent", error);
      return { success: false, error: "Failed to log this event" };
    }

    revalidatePath("/career");
    return { success: true };
  } catch (error) {
    console.error("[actions/careerEvents] logApplicationEvent", error);
    return { success: false, error: "Failed to log this event" };
  }
}

export async function logInterviewEvent(input: {
  jobId: string;
  panelMemberId?: string | null;
  outcome?: InterviewEventOutcome;
  notes?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database.from("interview_events").insert([
      {
        user_id: user.id,
        job_id: input.jobId,
        panel_member_id: input.panelMemberId || null,
        outcome: input.outcome || null,
        notes: input.notes || null,
      },
    ]);

    if (error) {
      console.error("[actions/careerEvents] logInterviewEvent", error);
      return { success: false, error: "Failed to log this interview event" };
    }

    revalidatePath("/career");
    return { success: true };
  } catch (error) {
    console.error("[actions/careerEvents] logInterviewEvent", error);
    return { success: false, error: "Failed to log this interview event" };
  }
}

export async function logCompensationEvent(input: {
  jobId?: string | null;
  eventType: CompensationEventType;
  baseSalary?: number | null;
  bonus?: number | null;
  equityValue?: number | null;
  effectiveDate: string;
  notes?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database.from("compensation_events").insert([
      {
        user_id: user.id,
        job_id: input.jobId || null,
        event_type: input.eventType,
        base_salary: input.baseSalary ?? null,
        bonus: input.bonus ?? null,
        equity_value: input.equityValue ?? null,
        effective_date: input.effectiveDate,
        notes: input.notes || null,
      },
    ]);

    if (error) {
      console.error("[actions/careerEvents] logCompensationEvent", error);
      return { success: false, error: "Failed to log this compensation event" };
    }

    revalidatePath("/career");
    return { success: true };
  } catch (error) {
    console.error("[actions/careerEvents] logCompensationEvent", error);
    return { success: false, error: "Failed to log this compensation event" };
  }
}

export type InterviewEventWithJobRow = {
  id: string;
  event_date: string;
  outcome: InterviewEventOutcome | null;
  job_title: string | null;
  job_company: string | null;
};

// §Q4a STAR Vault linking — a display-friendly list (job title/company
// resolved) for the "link this story to an interview" picker on /career.
// insforge-js's embedded-relation select syntax isn't used elsewhere in this
// codebase, so this stays a plain two-query join like buildFlatTimeline's
// jobsById pattern, done server-side instead of shipping both raw lists to
// the client.
export async function listInterviewEventsWithJob(): Promise<{
  success: boolean;
  data?: InterviewEventWithJobRow[];
  error?: string;
}> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data: events, error } = await insforge.database
      .from("interview_events")
      .select("id,job_id,event_date,outcome")
      .eq("user_id", user.id)
      .order("event_date", { ascending: false });

    if (error) {
      console.error("[actions/careerEvents] listInterviewEventsWithJob", error);
      return { success: false, error: "Failed to load your interview history" };
    }

    const jobIds = [...new Set((events ?? []).map((e) => e.job_id))];
    const jobsById = new Map<string, { title: string | null; company: string | null }>();
    if (jobIds.length > 0) {
      const { data: jobs } = await insforge.database
        .from("jobs")
        .select("id,title,company")
        .in("id", jobIds);
      for (const job of jobs ?? []) {
        jobsById.set(job.id, { title: job.title, company: job.company });
      }
    }

    const result: InterviewEventWithJobRow[] = (events ?? []).map((e) => ({
      id: e.id,
      event_date: e.event_date,
      outcome: e.outcome,
      job_title: jobsById.get(e.job_id)?.title ?? null,
      job_company: jobsById.get(e.job_id)?.company ?? null,
    }));

    return { success: true, data: result };
  } catch (error) {
    console.error("[actions/careerEvents] listInterviewEventsWithJob", error);
    return { success: false, error: "Failed to load your interview history" };
  }
}

export async function listCompensationEvents(): Promise<{
  success: boolean;
  data?: CompensationEventRow[];
  error?: string;
}> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.database
      .from("compensation_events")
      .select(COMPENSATION_EVENT_COLUMNS)
      .eq("user_id", user.id)
      .order("effective_date", { ascending: false });

    if (error) {
      console.error("[actions/careerEvents] listCompensationEvents", error);
      return { success: false, error: "Failed to load your compensation history" };
    }

    return { success: true, data: (data ?? []) as CompensationEventRow[] };
  } catch (error) {
    console.error("[actions/careerEvents] listCompensationEvents", error);
    return { success: false, error: "Failed to load your compensation history" };
  }
}

export type JobEventHistoryItem = {
  id: string;
  date: string;
  kind: "application" | "interview" | "compensation";
  label: string;
  notes: string | null;
};

// Per-job event history — application_events/interview_events/compensation_events
// have only ever been WRITTEN from the job detail page (JobActionBar's status
// changes), never read back on it; the only place a user could see this data
// before was the global /career flat timeline, mixed in with every other job.
// This scopes the same three tables to one job_id for display right where a
// user is actually looking when they want "what's happened on this application."
export async function listJobEventHistory(jobId: string): Promise<{
  success: boolean;
  data?: JobEventHistoryItem[];
  error?: string;
}> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const [applicationResult, interviewResult, compensationResult] = await Promise.all([
      insforge.database
        .from("application_events")
        .select("id,event_type,event_date,notes")
        .eq("user_id", user.id)
        .eq("job_id", jobId),
      insforge.database
        .from("interview_events")
        .select("id,outcome,event_date,notes")
        .eq("user_id", user.id)
        .eq("job_id", jobId),
      insforge.database
        .from("compensation_events")
        .select("id,event_type,effective_date,notes")
        .eq("user_id", user.id)
        .eq("job_id", jobId),
    ]);

    if (applicationResult.error || interviewResult.error || compensationResult.error) {
      console.error(
        "[actions/careerEvents] listJobEventHistory",
        applicationResult.error,
        interviewResult.error,
        compensationResult.error,
      );
      return { success: false, error: "Failed to load this job's history" };
    }

    const items: JobEventHistoryItem[] = [
      ...(applicationResult.data ?? []).map((e: { id: string; event_type: ApplicationEventType; event_date: string; notes: string | null }) => ({
        id: e.id,
        date: e.event_date,
        kind: "application" as const,
        label: APPLICATION_EVENT_LABELS[e.event_type],
        notes: e.notes,
      })),
      ...(interviewResult.data ?? []).map((e: { id: string; outcome: InterviewEventOutcome | null; event_date: string; notes: string | null }) => ({
        id: e.id,
        date: e.event_date,
        kind: "interview" as const,
        label: e.outcome ? `Interview — ${INTERVIEW_OUTCOME_LABELS[e.outcome]}` : "Interview logged",
        notes: e.notes,
      })),
      ...(compensationResult.data ?? []).map((e: { id: string; event_type: CompensationEventType; effective_date: string; notes: string | null }) => ({
        id: e.id,
        date: e.effective_date,
        kind: "compensation" as const,
        label: COMPENSATION_EVENT_LABELS[e.event_type],
        notes: e.notes,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { success: true, data: items };
  } catch (error) {
    console.error("[actions/careerEvents] listJobEventHistory", error);
    return { success: false, error: "Failed to load this job's history" };
  }
}
