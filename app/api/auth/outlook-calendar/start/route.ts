import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { requireUser } from "@/lib/auth";
import { buildOutlookAuthUrl } from "@/lib/outlookCalendar";

const STATE_COOKIE = "outlook_oauth_state";

export async function GET(request: NextRequest): Promise<NextResponse> {
  await requireUser();

  const state = randomBytes(16).toString("hex");
  const redirectUri = new URL("/api/auth/outlook-calendar/callback", request.nextUrl.origin).toString();

  const response = NextResponse.redirect(buildOutlookAuthUrl(redirectUri, state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
