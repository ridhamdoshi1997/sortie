import { NextRequest, NextResponse } from "next/server";
import { createInsforgeServerAnon } from "@/lib/insforge-server";
import { toUserMessage } from "@/lib/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required." }, { status: 400 });
    }

    const insforge = createInsforgeServerAnon();
    const { error } = await insforge.auth.sendResetPasswordEmail({
      email,
      redirectTo: new URL("/login", request.url).toString(),
    });

    // Deliberately succeed even on a "no such user" style error — never
    // reveal whether an email has an account via this endpoint's response.
    if (error && error.statusCode !== 404) {
      return NextResponse.json(
        { success: false, error: toUserMessage(error.message, "Could not send the reset email.") },
        { status: error.statusCode ?? 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/request-reset]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
