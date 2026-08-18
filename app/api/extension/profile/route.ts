import { NextRequest, NextResponse } from "next/server";

import { toUserMessage } from "@/lib/errors";
import { extractBearerToken, getAdminClient, resolveApiKeyUser, touchApiKeyLastUsed } from "@/lib/extensionAuth";
import type { Profile } from "@/types";

// §Q5 Capture Layer — the extension's autofill data source. Read-only,
// bearer-token-authed the same way as capture-job. Deliberately scoped to
// the fields a job-application form actually asks for (contact info + the
// couple of common "screening question" fields) — never the full profile
// (skills/work history/education), which the extension has no reason to see
// and this route has no UI to review before it goes into a page's own DOM.
const PROFILE_COLUMNS =
  "full_name,email,phone,location,linkedin_url,portfolio_url,current_title,salary_expectation,work_authorization";

export type ExtensionProfileFields = Pick<
  Profile,
  | "full_name"
  | "email"
  | "phone"
  | "location"
  | "linkedin_url"
  | "portfolio_url"
  | "current_title"
  | "salary_expectation"
  | "work_authorization"
>;

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

    const { data: profile } = await admin.database
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", apiKey.user_id)
      .maybeSingle<ExtensionProfileFields>();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    touchApiKeyLastUsed(admin, apiKey.id);

    return NextResponse.json({ success: true, profile }, { status: 200 });
  } catch (error) {
    console.error("[api/extension/profile]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
