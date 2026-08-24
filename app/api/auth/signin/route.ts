import { NextRequest, NextResponse } from "next/server";
import { createServerClient, setAuthCookies } from "@insforge/sdk/ssr";

import { getPostLoginRedirectPath } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, password } = (await request.json()) as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 },
      );
    }

    const insforge = createServerClient();
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });

    if (error || !data?.accessToken || !data.user) {
      const unverified = error?.statusCode === 403;
      if (unverified) {
        // The UI tells the user "we sent you a code" the moment it shows
        // the verify screen — make that true here rather than relying on
        // whatever code (if any) was sent during the original signup,
        // which may be long expired or, like this project's first real
        // signup attempt, never delivered at all (SMTP provider outage).
        await insforge.auth
          .resendVerificationEmail({ email, redirectTo: new URL("/login", request.url).toString() })
          .catch(() => {});
      }
      return NextResponse.json(
        {
          success: false,
          error: unverified
            ? "Please verify your email first."
            : toUserMessage(error?.message, "Incorrect email or password."),
          requireVerification: unverified,
        },
        { status: error?.statusCode ?? 401 },
      );
    }

    const redirectPath = await getPostLoginRedirectPath(data.user.id);
    const response = NextResponse.json({ success: true, redirectPath });
    setAuthCookies(response.cookies, {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return response;
  } catch (error) {
    console.error("[auth/signin]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
