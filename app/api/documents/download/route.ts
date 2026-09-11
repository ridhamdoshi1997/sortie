import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { buildDefaultStyle } from "@/lib/resumeSections";
import { ResumePDF } from "@/components/documents/ResumePDF";
import { CoverLetterPDF } from "@/components/documents/CoverLetterPDF";
import type { Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

// The PDF is a DERIVED ARTIFACT, rendered here on demand.
//
// It used to be generated and uploaded to storage on every chat revision,
// and this route just served whatever file was sitting there. That put a
// slow render plus a remote upload on the hot path of every one-word tweak
// (and a transient ECONNRESET there could destroy a revision the AI had
// already been paid for), while archiving a permanent version of the old
// document each time against a 500 MB budget.
//
// Now the chat/editor paths only write resume_sections/resume_style — the
// real durable state — and the bytes are produced here, from that state, at
// the moment someone actually asks for the file. Two consequences worth
// knowing:
//   * A download is always current by construction. There is no stale-file
//     window, because there is no stored file to go stale.
//   * A résumé that was never touched by the new editor still has no
//     sections, so the legacy stored PDF remains the fallback below rather
//     than 404ing documents generated before this change.

type ApplicationRow = {
  resume_sections: ResumeSection[] | null;
  resume_style: ResumeStyle | null;
  generated_cover_letter: string | null;
  cover_letter_salutation: string | null;
  resume_pdf_url: string | null;
  cover_letter_pdf_url: string | null;
};

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

    const [{ data: application }, { data: profile }] = await Promise.all([
      insforge.database
        .from("applications")
        .select(
          "resume_sections,resume_style,generated_cover_letter,cover_letter_salutation,resume_pdf_url,cover_letter_pdf_url",
        )
        .eq("user_id", user.id)
        .eq("job_id", jobId)
        .maybeSingle<ApplicationRow>(),
      insforge.database.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    ]);

    const filename = kind === "resume" ? "resume.pdf" : "cover-letter.pdf";
    const headers = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      // Same URL before and after a revision, so without this the browser
      // serves its cached copy instead of the freshly rendered bytes.
      "Cache-Control": "no-store, must-revalidate",
    };

    const style = application?.resume_style ?? buildDefaultStyle(profile?.preferred_resume_theme ?? null);

    if (profile && kind === "resume" && application?.resume_sections?.length) {
      const buffer = await renderToBuffer(
        React.createElement(ResumePDF, {
          profile,
          sections: application.resume_sections,
          style,
        }) as unknown as React.ReactElement<DocumentProps>,
      );
      return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
    }

    if (profile && kind === "cover_letter" && application?.generated_cover_letter) {
      const buffer = await renderToBuffer(
        React.createElement(CoverLetterPDF, {
          profile,
          company: null,
          letterBody: application.generated_cover_letter,
          style,
          salutation: application.cover_letter_salutation,
        }) as unknown as React.ReactElement<DocumentProps>,
      );
      return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
    }

    // Legacy fallback — a document generated before on-demand rendering,
    // which has a stored PDF but no sections to re-render from.
    const urlColumn = kind === "resume" ? "resume_pdf_url" : "cover_letter_pdf_url";
    const storagePath = application?.[urlColumn];
    if (!storagePath) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data: blob, error } = await insforge.storage.from("resumes").download(storagePath);
    if (error || !blob) {
      console.error("[api/documents/download]", error);
      return NextResponse.json({ error: "Failed to download document" }, { status: 500 });
    }

    return new NextResponse(await blob.arrayBuffer(), { status: 200, headers });
  } catch (error) {
    console.error("[api/documents/download]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
