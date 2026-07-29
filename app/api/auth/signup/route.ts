import { NextRequest, NextResponse } from "next/server";
import { createServerClient, setAuthCookies } from "@insforge/sdk/ssr";

// Mirrors the shape/response style app/api/auth/oauth/[provider]/route.ts
// and app/(auth)/callback/route.ts already use for OAuth — this project's
// established pattern is manual setAuthCookies/clearAuthCookies via
// createServerClient(), not the SDK's createAuthActions() wrapper, so this
// stays consistent with that rather than mixing two cookie-writing styles.
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, password, name } = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 },
      );
    }

    const insforge = createServerClient();
    const { data, error } = await insforge.auth.signUp({
      email,
      password,
      name,
      redirectTo: new URL("/login", request.url).toString(),
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message ?? "Sign up failed." },
        { status: error.statusCode ?? 400 },
      );
    }

    if (data?.requireEmailVerification) {
      // No session yet — nothing to cook. The client moves to a
      // code-entry step next.
      return NextResponse.json({ success: true, requireVerification: true });
    }

    // Verification not required for this project's config — sign-up
    // already returns a session. Same cookie pattern as OAuth's callback.
    if (data?.accessToken) {
      const response = NextResponse.json({ success: true, requireVerification: false });
      setAuthCookies(response.cookies, {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      return response;
    }

    return NextResponse.json(
      { success: false, error: "Sign up did not return a session or verification step." },
      { status: 500 },
    );
  } catch (error) {
    console.error("[auth/signup]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
