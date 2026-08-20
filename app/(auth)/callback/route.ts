import { NextRequest, NextResponse } from "next/server";
import {
  clearAuthCookies,
  createServerClient,
  setAuthCookies,
} from "@insforge/sdk/ssr";

const verifierCookieName = "sortie_oauth_code_verifier";

type ProfileCompletionRow = {
  is_complete: boolean | null;
  onboarding_completed_at: string | null;
};

async function getRedirectPath(userId: string, accessToken: string): Promise<string> {
  const insforge = createServerClient({ accessToken });
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
    const code = request.nextUrl.searchParams.get("insforge_code");
    const codeVerifier = request.cookies.get(verifierCookieName)?.value;

    if (callbackError || !code || !codeVerifier) {
      loginUrl.searchParams.set("error", "callback");
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete(verifierCookieName);
      clearAuthCookies(response.cookies);
      return response;
    }

    const insforge = createServerClient();
    const { data, error } = await insforge.auth.exchangeOAuthCode(
      code,
      codeVerifier,
    );

    if (error || !data?.accessToken || !data.user) {
      console.error("[auth/callback]", error);
      loginUrl.searchParams.set("error", "callback");
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete(verifierCookieName);
      clearAuthCookies(response.cookies);
      return response;
    }

    const redirectPath = await getRedirectPath(data.user.id, data.accessToken);
    const response = NextResponse.redirect(new URL(redirectPath, request.url));
    response.cookies.delete(verifierCookieName);
    setAuthCookies(response.cookies, {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });

    return response;
  } catch (error) {
    console.error("[auth/callback]", error);
    loginUrl.searchParams.set("error", "callback");
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(verifierCookieName);
    clearAuthCookies(response.cookies);
    return response;
  }
}
