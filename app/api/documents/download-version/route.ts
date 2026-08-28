import { NextRequest, NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";

// Version manager's "View" action (components/documents/DocumentVersionHistory.tsx)
// — same shape as /api/documents/download, but reads an archived
// document_versions row (ownership enforced by the query itself, not just
// RLS) instead of the live applications row.
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const versionId = request.nextUrl.searchParams.get("versionId");
    if (!versionId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const insforge = await createInsforgeServer();

    const { data: version } = await insforge.database
      .from("document_versions")
      .select("storage_path,kind")
      .eq("id", versionId)
      .eq("user_id", user.id)
      .maybeSingle<{ storage_path: string; kind: "resume" | "cover_letter" }>();

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    const { data: blob, error } = await insforge.storage.from("resumes").download(version.storage_path);
    if (error || !blob) {
      console.error("[api/documents/download-version]", error);
      return NextResponse.json({ error: "Failed to download document" }, { status: 500 });
    }

    const buffer = await blob.arrayBuffer();
    const filename = version.kind === "resume" ? "resume.pdf" : "cover-letter.pdf";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/documents/download-version]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
