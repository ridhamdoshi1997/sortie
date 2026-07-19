import { NextRequest, NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobId = request.nextUrl.searchParams.get("jobId");
    const kind = request.nextUrl.searchParams.get("kind");
    if (!jobId || (kind !== "resume" && kind !== "cover_letter")) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const insforge = await createInsforgeServer();
    const urlColumn = kind === "resume" ? "resume_pdf_url" : "cover_letter_pdf_url";

    const { data: application } = await insforge.database
      .from("applications")
      .select(urlColumn)
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle<Record<string, string | null>>();

    const storagePath = application?.[urlColumn];
    if (!storagePath) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data: blob, error } = await insforge.storage
      .from("resumes")
      .download(storagePath);

    if (error || !blob) {
      console.error("[api/documents/download]", error);
      return NextResponse.json(
        { error: "Failed to download document" },
        { status: 500 },
      );
    }

    const buffer = await blob.arrayBuffer();
    const filename = kind === "resume" ? "resume.pdf" : "cover-letter.pdf";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        // This URL is identical before and after a chat revision (same
        // jobId/kind) — without this, the browser serves its cached copy
        // of the PDF instead of the freshly revised bytes this route
        // always fetches from storage.
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/documents/download]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
