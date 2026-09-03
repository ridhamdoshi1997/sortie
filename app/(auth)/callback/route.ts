import { NextRequest, NextResponse } from "next/server";
import { createInsforgeServer } from "@/lib/insforge-server";

type ProfileCompletionRow = {
  is_complete: boolean | null;
  onboarding_completed_at: string | null;
};

async function getRedirectPath(insforge: Awaited<ReturnType<typeof createInsforgeServer>>, userId: string): Promise<string> {
  const { data, error } = await insforge.database
    .from("profiles")
    .select("is_complete,onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle<ProfileCompletionRow>();

  if (error) {
    return "/profile";
  }

  if (!data?.onboarding_completed_at) {
    return "/onboarding";
  }

  if (!data.is_complete) {
    return "/profile";
  }

  return "/dashboard";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const loginUrl = new URL("/login", request.url);

  try {
    const callbackError = request.nextUrl.searchParams.get("error");
    const code = request.nextUrl.searchParams.get("code");

    if (callbackError || !code) {
      loginUrl.searchParams.set("error", "callback");
      return NextResponse.redirect(loginUrl);
    }

    // No manual code-verifier cookie to read — Supabase's own PKCE verifier
    // cookie (set by signInWithOAuth in app/api/auth/oauth/[provider]/route.ts,
    // via the SAME cookies()-bound client type) is read automatically here.
    // The session cookie itself is also written automatically as a side
    // effect of this call, via this client's cookie adapter — no manual
    // setAuthCookies needed.
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.auth.exchangeOAuthCode(code);

    if (error || !data?.user) {
      console.error("[auth/callback]", error);
      loginUrl.searchParams.set("error", "callback");
      return NextResponse.redirect(loginUrl);
    }

    const redirectPath = await getRedirectPath(insforge, data.user.id);
    return NextResponse.redirect(new URL(redirectPath, request.url));
  } catch (error) {
    console.error("[auth/callback]", error);
    loginUrl.searchParams.set("error", "callback");
    return NextResponse.redirect(loginUrl);
  }
}
