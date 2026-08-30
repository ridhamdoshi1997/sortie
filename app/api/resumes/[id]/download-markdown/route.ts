import { NextRequest, NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { buildResumeMarkdown } from "@/lib/resumeMarkdown";
import { toUserMessage } from "@/lib/errors";
import type { ResumeSection } from "@/types/resumeEditor";
import type { Profile } from "@/types";

// Résumé-slot counterpart to app/api/documents/download-markdown (the
// job-tailored route) — same reasoning as download-docx/route.ts's own
// header comment: general-purpose résumé slots live in `resumes` keyed by
// id, not in `applications` keyed by (user_id, job_id).
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
        .select("name,sections")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle<{ name: string; sections: ResumeSection[] | null }>(),
      insforge.database
        .from("profiles")
        .select("full_name,email,phone,location")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "full_name" | "email" | "phone" | "location">>(),
    ]);

    if (!resume?.sections) {
      return NextResponse.json({ error: "Résumé not found" }, { status: 404 });
    }

    const markdown = buildResumeMarkdown(resume.sections, {
      fullName: profile?.full_name ?? "",
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      location: profile?.location ?? null,
    });

    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${resume.name.replace(/[^\w.-]/g, "_")}.md"`,
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/resumes/[id]/download-markdown]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
