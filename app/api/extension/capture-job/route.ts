import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createExternalJob } from "@/lib/externalJob";
import { toUserMessage } from "@/lib/errors";
import { extractBearerToken, getAdminClient, resolveApiKeyUser, touchApiKeyLastUsed } from "@/lib/extensionAuth";

// §Q5 Capture Layer — the browser extension's only capture endpoint.
// Bearer-token-authed against user_api_keys (a content script has no access
// to the web app's session cookie), then reuses the exact same job-creation
// logic actions/jobs.ts's addExternalJob already runs for the "paste a job
// from anywhere" flow — this is a thin auth wrapper, not new capture logic.
const bodySchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  description: z.string().min(1),
  url: z.string().optional(),
  // Which site this was captured from — set by extension/content.js's
  // extractLinkedIn()/extractIndeed(), previously extracted then silently
  // discarded (every extension capture collapsed into the same generic
  // "url" source the manual paste-a-URL flow uses, indistinguishable from
  // it or from each other). Absent entirely for older extension builds —
  // createExternalJob falls back to "url" when this isn't sent.
  source: z
    .enum([
      "linkedin",
      "indeed",
      "simplyhired",
      "dice",
      "careerbuilder",
      "remoteok",
      "monster",
      "weworkremotely",
      "builtin",
      "ziprecruiter",
    ])
    .optional(),
  // The popup's stage picker (2026-08-18 v1.2) — lets the user mark a job
  // Applied at the moment they save it, instead of always landing in Draft.
  // Deliberately just this one extra state, not the full 5-stage pipeline —
  // Interviewing/Offered/Rejected don't make sense to set before the app
  // itself has any real signal that they happened.
  markApplied: z.boolean().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawKey = extractBearerToken(request);
    if (!rawKey) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid job payload" }, { status: 400 });
    }

    const admin = getAdminClient();
    const apiKey = await resolveApiKeyUser(admin, rawKey);
    if (!apiKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const result = await createExternalJob(admin, apiKey.user_id, parsed.data);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (parsed.data.markApplied) {
      // Best-effort, mirrors actions/jobs.ts's setApplicationStatus shape —
      // a failed status/event write here shouldn't fail the capture itself,
      // the job is already safely saved in Draft either way.
      await admin.database
        .from("jobs")
        .update({ application_status: "applied", application_status_updated_at: new Date().toISOString() })
        .eq("id", result.jobId)
        .then(undefined, (error: unknown) => console.error("[api/extension/capture-job] markApplied status update failed", error));

      await admin.database
        .from("application_events")
        .insert([{ user_id: apiKey.user_id, job_id: result.jobId, event_type: "applied" }])
        .then(undefined, (error: unknown) => console.error("[api/extension/capture-job] markApplied event log failed", error));
    }

    touchApiKeyLastUsed(admin, apiKey.id);

    return NextResponse.json({ success: true, jobId: result.jobId }, { status: 200 });
  } catch (error) {
    console.error("[api/extension/capture-job]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
