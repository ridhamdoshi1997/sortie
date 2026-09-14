import { NextRequest, NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { buildResumeDocx } from "@/lib/resumeDocx";
import { buildDefaultStyle } from "@/lib/resumeSections";
import { toUserMessage } from "@/lib/errors";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";
import type { Profile } from "@/types";

// Résumé-slot counterpart to app/api/documents/download-docx (the job-tailored
// route) — same buildResumeDocx() call, different source table. General-
// purpose uploaded/edited résumés (ResumeSlotWorkspace.tsx) live in `resumes`
// keyed by id, not in `applications` keyed by (user_id, job_id) the way a
// job-tailored résumé does, so this needed its own route rather than reusing
// the existing one with an extra query param.
//
// Reads the slot's own style too, so its Word file matches its PDF
// (2026-09-14) rather than a generic layout.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const insforge = await createInsforgeServer();

    const [{ data: resume }, { data: profile }] = await Promise.all([
      insforge.database
        .from("resumes")
        .select("name,sections,style")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle<{ name: string; sections: ResumeSection[] | null; style: ResumeStyle | null }>(),
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

    if (!resume?.sections) {
      return NextResponse.json({ error: "Résumé not found" }, { status: 404 });
    }

    const style = resume.style ?? buildDefaultStyle(profile?.preferred_resume_theme ?? null);

    const buffer = await buildResumeDocx(resume.sections, style, {
      full_name: profile?.full_name ?? "",
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      location: profile?.location ?? null,
      current_title: profile?.current_title ?? null,
      linkedin_url: profile?.linkedin_url ?? null,
      portfolio_url: profile?.portfolio_url ?? null,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${resume.name.replace(/[^\w.-]/g, "_")}.docx"`,
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/resumes/[id]/download-docx]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
