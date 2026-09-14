import { NextRequest, NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { buildResumeDocx } from "@/lib/resumeDocx";
import { buildDefaultStyle } from "@/lib/resumeSections";
import { toUserMessage } from "@/lib/errors";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";
import type { Profile } from "@/types";

// DOCX resume export (build-plan.md §C, Phase 16) — reads the same
// structured content the PDF workspace already generated
// (applications.resume_sections), never a new AI call. Resume only for
// v1 — cover letters stay PDF-only, a DOCX cover letter isn't a real ATS
// need the way a DOCX resume is.
//
// Also reads resume_style and the header fields the PDF shows (title,
// LinkedIn, portfolio), so the Word file carries the same theme and header as
// the PDF instead of a generic layout (2026-09-14).
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
        .select("resume_sections,resume_style")
        .eq("user_id", user.id)
        .eq("job_id", jobId)
        .maybeSingle<{ resume_sections: ResumeSection[] | null; resume_style: ResumeStyle | null }>(),
      insforge.database
        .from("profiles")
        .select("full_name,email,phone,location,current_title,linkedin_url,portfolio_url,preferred_resume_theme")
        .eq("id", user.id)
        .maybeSingle<
          Pick<
            Profile,
            "full_name" | "email" | "phone" | "location" | "current_title" | "linkedin_url" | "portfolio_url" | "preferred_resume_theme"
          >
        >(),
    ]);

    if (!application?.resume_sections) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    // Same fallback the editor page uses for a row saved before styles existed.
    const style = application.resume_style ?? buildDefaultStyle(profile?.preferred_resume_theme ?? null);

    const buffer = await buildResumeDocx(application.resume_sections, style, {
      full_name: profile?.full_name ?? "",
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      location: profile?.location ?? null,
      current_title: profile?.current_title ?? null,
      linkedin_url: profile?.linkedin_url ?? null,
      portfolio_url: profile?.portfolio_url ?? null,
    });

    // Named for the person, not "resume.docx" — a recruiter's downloads
    // folder fills with identical filenames otherwise.
    const baseName = (profile?.full_name ?? "").trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
    const fileName = baseName ? `${baseName}-Resume.docx` : "Resume.docx";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/documents/download-docx]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
