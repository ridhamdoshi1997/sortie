import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { exchangeCodeForRefreshToken } from "@/lib/outlookCalendar";

const STATE_COOKIE = "outlook_oauth_state";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  const settingsUrl = new URL("/settings", request.url);

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("outlook_error", "1");
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  const redirectUri = new URL("/api/auth/outlook-calendar/callback", request.nextUrl.origin).toString();
  const refreshToken = await exchangeCodeForRefreshToken(code, redirectUri);

  if (!refreshToken) {
    settingsUrl.searchParams.set("outlook_error", "1");
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }

  const insforge = await createInsforgeServer();
  await insforge.database
    .from("profiles")
    .update({
      outlook_refresh_token: refreshToken,
      outlook_connected_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  settingsUrl.searchParams.set("outlook_connected", "1");
  const response = NextResponse.redirect(settingsUrl);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
