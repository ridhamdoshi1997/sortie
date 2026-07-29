import { NextRequest, NextResponse } from "next/server";
import { createServerClient, setAuthCookies } from "@insforge/sdk/ssr";

import { getPostLoginRedirectPath } from "@/lib/auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, otp } = (await request.json()) as { email?: string; otp?: string };

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, error: "Email and code are required." },
        { status: 400 },
      );
    }

    const insforge = createServerClient();
    const { data, error } = await insforge.auth.verifyEmail({ email, otp });

    if (error || !data?.accessToken || !data.user) {
      return NextResponse.json(
        { success: false, error: error?.message ?? "Invalid or expired code." },
        { status: error?.statusCode ?? 400 },
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
    console.error("[auth/verify-email]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
