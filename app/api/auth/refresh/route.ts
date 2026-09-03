import { NextResponse } from "next/server";
import { createInsforgeServer } from "@/lib/insforge-server";

// Replaces InsForge's createRefreshAuthRouter() — Supabase's getUser() (via
// this cookies()-bound client) re-validates against the Auth server and
// silently refreshes an expired access token using the refresh token,
// writing the new session cookie automatically via the client's own
// adapter. AuthStateProvider.tsx's authoritative check calls this route.
export async function POST(): Promise<NextResponse> {
  const insforge = await createInsforgeServer();
  const { data } = await insforge.auth.getCurrentUser();
  return NextResponse.json({ user: data.user ?? null });
}
