import { NextRequest, NextResponse } from "next/server";
import { createServerClient, setAuthCookies } from "@insforge/sdk/ssr";

import { getPostLoginRedirectPath } from "@/lib/auth";

// Google One Tap (build-plan.md §H) — mirrors app/api/auth/signin/route.ts's
// exact pattern (server-side InsForge call + setAuthCookies on our own
// domain), just swapping signInWithPassword for signInWithIdToken. The
// client only ever hands us the raw Google ID token; InsForge verifies it
// server-side against the same Google OAuth client already configured for
// the existing "Continue with Google" button, so the token audience
// already matches — no new Google Cloud app needed.
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { credential } = (await request.json()) as { credential?: string };

    if (!credential) {
      return NextResponse.json({ success: false, error: "Missing credential" }, { status: 400 });
    }

    const insforge = createServerClient();
    const { data, error } = await insforge.auth.signInWithIdToken({ provider: "google", token: credential });

    if (error || !data?.accessToken || !data.user) {
      console.error("[auth/google-one-tap]", error);
      return NextResponse.json({ success: false, error: "Google sign-in failed." }, { status: 401 });
    }

    const redirectPath = await getPostLoginRedirectPath(data.user.id);
    const response = NextResponse.json({ success: true, redirectPath });
    setAuthCookies(response.cookies, {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return response;
  } catch (error) {
    console.error("[auth/google-one-tap]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
