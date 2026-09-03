import { NextRequest, NextResponse } from "next/server";
import { createInsforgeServer } from "@/lib/insforge-server";
import { getPostLoginRedirectPath } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";

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

    // Cookie writes (when a session comes back immediately) happen
    // automatically via this client's adapter — no manual setAuthCookies.
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.auth.signUp({
      email,
      password,
      name,
      redirectTo: new URL("/login", request.url).toString(),
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: toUserMessage(error.message, "Sign up failed.") },
        { status: error.statusCode ?? 400 },
      );
    }

    if (data?.requireEmailVerification) {
      return NextResponse.json({ success: true, requireVerification: true });
    }

    if (data && "accessToken" in data && data.accessToken && data.user) {
      const redirectPath = await getPostLoginRedirectPath(data.user.id);
      return NextResponse.json({ success: true, requireVerification: false, redirectPath });
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
