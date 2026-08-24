import { NextRequest, NextResponse } from "next/server";

import { toUserMessage } from "@/lib/errors";
import { extractBearerToken, getAdminClient, resolveApiKeyUser, touchApiKeyLastUsed } from "@/lib/extensionAuth";

// Zapier / Google Sheets export (build-plan.md §G) — a generic polling
// endpoint for Zapier's own "Webhooks by Zapier" trigger, reusing the same
// personal API key already generated in Settings -> Browser extension
// (no new key system). Deliberately does NOT build a direct Google Sheets
// OAuth integration — Zapier already has a native Sheets action, so the
// user chains "Webhook trigger -> Google Sheets: Create Spreadsheet Row"
// entirely inside Zapier's own UI once pointed at this endpoint.
// Same Missions scope as the Notion export (`is_hidden = false`).
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rawKey = extractBearerToken(request);
    if (!rawKey) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }

    const admin = getAdminClient();
    const apiKey = await resolveApiKeyUser(admin, rawKey);
    if (!apiKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const { data: jobs } = await admin.database
      .from("jobs")
      .select("id,title,company,location,url,source_url,application_status,recommendation_score,found_at")
      .eq("user_id", apiKey.user_id)
      .eq("is_hidden", false)
      .order("found_at", { ascending: false })
      .limit(200);

    touchApiKeyLastUsed(admin, apiKey.id);

    return NextResponse.json({ success: true, jobs: jobs ?? [] }, { status: 200 });
  } catch (error) {
    console.error("[api/integrations/jobs]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
