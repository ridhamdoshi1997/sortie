import { NextRequest, NextResponse } from "next/server";

import { createAdminDbClient } from "@/lib/admin/client";

// CAN-SPAM's required unsubscribe mechanism — unauthenticated (a real
// email link can't carry a session), resolves the real per-user token
// (profiles.unsubscribe_token, see the marketing_broadcasts migration's
// own comment for why this is a stored token, not a stateless signed
// one), flips marketing_opt_out, and returns a plain confirmation page.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse(renderPage("Missing unsubscribe link.", false), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const admin = createAdminDbClient();
  const { data: profile } = await admin.database.from("profiles").select("id").eq("unsubscribe_token", token).maybeSingle<{ id: string }>();

  if (!profile) {
    return new NextResponse(renderPage("This unsubscribe link is invalid or has expired.", false), { status: 404, headers: { "Content-Type": "text/html" } });
  }

  await admin.database.from("profiles").update({ marketing_opt_out: true }).eq("id", profile.id);

  return new NextResponse(renderPage("You've been unsubscribed from Sortie marketing emails.", true), { status: 200, headers: { "Content-Type": "text/html" } });
}

function renderPage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Unsubscribe — Sortie</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#f5f5f5}
main{max-width:420px;text-align:center;padding:2rem}
h1{font-size:1.1rem;font-weight:600}
p{color:${success ? "#a3a3a3" : "#f87171"}}</style>
</head><body><main><h1>${success ? "Unsubscribed" : "Something went wrong"}</h1><p>${message}</p></main></body></html>`;
}
