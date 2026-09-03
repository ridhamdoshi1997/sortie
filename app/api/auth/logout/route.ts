import { NextRequest, NextResponse } from "next/server";
import { createInsforgeServer } from "@/lib/insforge-server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Cookie clearing happens automatically via this client's adapter as a
    // side effect of signOut() — no manual clearAuthCookies needed.
    const insforge = await createInsforgeServer();
    await insforge.auth.signOut();
  } catch (error) {
    console.error("[auth/logout]", error);
  }

  return NextResponse.redirect(new URL("/login", request.url));
}
