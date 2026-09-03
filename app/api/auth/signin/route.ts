import { NextRequest, NextResponse } from "next/server";
import { createInsforgeServer } from "@/lib/insforge-server";

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

    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.auth.signInWithPassword({ email, password });

    if (error || !data?.accessToken || !data.user) {
      // Supabase's real error message for this case, not a status code —
      // confirmed via @supabase/auth-js's own AuthApiError shape.
      const unverified = error?.message === "Email not confirmed";
      if (unverified) {
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
    return NextResponse.json({ success: true, redirectPath });
  } catch (error) {
    console.error("[auth/signin]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
