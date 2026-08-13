import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@insforge/sdk/ssr";
import { toUserMessage } from "@/lib/errors";

// resetPassword() returns only { message } — no session — so a successful
// reset does NOT sign the user in. They go back to /login to sign in with
// the new password, matching a standard "your password was changed"
// pattern rather than silently authenticating them from a password-reset
// code.
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, code, newPassword } = (await request.json()) as {
      email?: string;
      code?: string;
      newPassword?: string;
    };

    if (!email || !code || !newPassword) {
      return NextResponse.json(
        { success: false, error: "Email, code, and new password are required." },
        { status: 400 },
      );
    }

    const insforge = createServerClient();

    const { data: exchangeData, error: exchangeError } =
      await insforge.auth.exchangeResetPasswordToken({ email, code });

    if (exchangeError || !exchangeData?.token) {
      return NextResponse.json(
        { success: false, error: toUserMessage(exchangeError?.message, "Invalid or expired code.") },
        { status: exchangeError?.statusCode ?? 400 },
      );
    }

    const { error: resetError } = await insforge.auth.resetPassword({
      newPassword,
      otp: exchangeData.token,
    });

    if (resetError) {
      return NextResponse.json(
        { success: false, error: toUserMessage(resetError.message, "Could not reset password.") },
        { status: resetError.statusCode ?? 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/reset-password]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
