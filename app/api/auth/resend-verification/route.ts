import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@insforge/sdk/ssr";
import { toUserMessage } from "@/lib/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required." }, { status: 400 });
    }

    const insforge = createServerClient();
    const { error } = await insforge.auth.resendVerificationEmail({
      email,
      redirectTo: new URL("/login", request.url).toString(),
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: toUserMessage(error.message, "Could not resend the code.") },
        { status: error.statusCode ?? 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/resend-verification]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
