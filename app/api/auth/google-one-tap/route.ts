import { NextRequest, NextResponse } from "next/server";
import { createInsforgeServer } from "@/lib/insforge-server";

import { getPostLoginRedirectPath } from "@/lib/auth";

// Google One Tap (build-plan.md §H) — mirrors app/api/auth/signin/route.ts's
// exact pattern, just swapping signInWithPassword for signInWithIdToken. The
// client only ever hands us the raw Google ID token; Supabase verifies it
// server-side against the same Google OAuth client config, same as before.
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { credential } = (await request.json()) as { credential?: string };

    if (!credential) {
      return NextResponse.json({ success: false, error: "Missing credential" }, { status: 400 });
    }

    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.auth.signInWithIdToken({ provider: "google", token: credential });

    if (error || !data?.accessToken || !data.user) {
      console.error("[auth/google-one-tap]", error);
      return NextResponse.json({ success: false, error: "Google sign-in failed." }, { status: 401 });
    }

    const redirectPath = await getPostLoginRedirectPath(data.user.id);
    return NextResponse.json({ success: true, redirectPath });
  } catch (error) {
    console.error("[auth/google-one-tap]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
