import { NextRequest, NextResponse } from "next/server";
import { createInsforgeServer } from "@/lib/insforge-server";

import { getPostLoginRedirectPath } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, otp } = (await request.json()) as { email?: string; otp?: string };

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, error: "Email and code are required." },
        { status: 400 },
      );
    }

    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.auth.verifyEmail({ email, otp });

    if (error || !data?.accessToken || !data.user) {
      return NextResponse.json(
        { success: false, error: toUserMessage(error?.message, "Invalid or expired code.") },
        { status: error?.statusCode ?? 400 },
      );
    }

    const redirectPath = await getPostLoginRedirectPath(data.user.id);
    return NextResponse.json({ success: true, redirectPath });
  } catch (error) {
    console.error("[auth/verify-email]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
