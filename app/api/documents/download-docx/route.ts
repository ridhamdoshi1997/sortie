import { NextRequest, NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { buildResumeDocx } from "@/lib/resumeDocx";
import { toUserMessage } from "@/lib/errors";
import type { ResumeSection } from "@/types/resumeEditor";
import type { Profile } from "@/types";

// DOCX resume export (build-plan.md §C, Phase 16) — reads the same
// structured content the PDF workspace already generated
// (applications.resume_sections), never a new AI call. Resume only for
// v1 — cover letters stay PDF-only, a DOCX cover letter isn't a real ATS
// need the way a DOCX resume is.
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const insforge = await createInsforgeServer();

    const [{ data: application }, { data: profile }] = await Promise.all([
      insforge.database
        .from("applications")
        .select("resume_sections")
        .eq("user_id", user.id)
        .eq("job_id", jobId)
        .maybeSingle<{ resume_sections: ResumeSection[] | null }>(),
      insforge.database
        .from("profiles")
        .select("full_name,email,phone,location")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "full_name" | "email" | "phone" | "location">>(),
    ]);

    if (!application?.resume_sections) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    const buffer = await buildResumeDocx(application.resume_sections, {
      fullName: profile?.full_name ?? "",
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      location: profile?.location ?? null,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="resume.docx"',
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/documents/download-docx]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
