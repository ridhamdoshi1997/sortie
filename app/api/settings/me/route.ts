import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";

// Backs the settings modal (components/settings/SettingsModal.tsx), which
// can open as an overlay on top of any page — it can't rely on a server
// component's props the way the /settings page fallback does, so it fetches
// this itself on open.
export async function GET(): Promise<NextResponse> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();
  const { data } = await insforge.auth.getCurrentUser();

  return NextResponse.json({
    email: data.user?.email ?? user.email ?? "",
    providers: data.user?.app_metadata?.providers ?? [],
  });
}
