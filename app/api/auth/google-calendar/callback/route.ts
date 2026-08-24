import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { exchangeCodeForRefreshToken } from "@/lib/googleCalendar";

const STATE_COOKIE = "google_calendar_oauth_state";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  const settingsUrl = new URL("/settings", request.url);

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("calendar_error", "1");
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  const redirectUri = new URL("/api/auth/google-calendar/callback", request.nextUrl.origin).toString();
  const refreshToken = await exchangeCodeForRefreshToken(code, redirectUri);

  if (!refreshToken) {
    settingsUrl.searchParams.set("calendar_error", "1");
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  const insforge = await createInsforgeServer();
  await insforge.database
    .from("profiles")
    .update({
      google_calendar_refresh_token: refreshToken,
      google_calendar_connected_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  settingsUrl.searchParams.set("calendar_connected", "1");
  const response = NextResponse.redirect(settingsUrl);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
