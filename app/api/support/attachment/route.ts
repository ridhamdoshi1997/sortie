import { NextRequest, NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminAuthError } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";

// Streams a screenshot out of the private `support-attachments` bucket,
// same pattern as app/api/documents/download/route.ts (server-side fetch +
// stream, never a client-facing signed URL). Keys are namespaced
// `${uploaderUserId}/...` (actions/support.ts's uploadSupportAttachment),
// so a non-admin can be authorized with a prefix check alone — no extra
// round trip to confirm which ticket the key belongs to. Any admin role
// (including support_readonly, which is read-only everywhere by design —
// lib/admin/auth.ts) can view any attachment, matching SupportInbox's own
// "admin can read every ticket" behavior.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = request.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isOwner = key.startsWith(`${user.id}/`);
  if (isOwner) {
    const insforge = await createInsforgeServer();
    return streamAttachment(await insforge.storage.from("support-attachments").download(key));
  }

  // Cross-user read (an admin viewing another user's attachment) needs the
  // service-role client — the regular cookie-authenticated client is still
  // scoped to this admin's own auth.uid() and storage RLS has no reason to
  // treat an admin_users row as a bypass on its own.
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw error;
  }

  const admin = createAdminDbClient();
  return streamAttachment(await admin.storage.from("support-attachments").download(key));
}

async function streamAttachment(result: { data: Blob | null; error: unknown }): Promise<NextResponse> {
  const { data: blob, error } = result;

  if (error || !blob) {
    console.error("[api/support/attachment]", error);
    return NextResponse.json({ error: "Failed to download attachment" }, { status: 500 });
  }

  const buffer = await blob.arrayBuffer();
  const contentType = blob.type || "application/octet-stream";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
