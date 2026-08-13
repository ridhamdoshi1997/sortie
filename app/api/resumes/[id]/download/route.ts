import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { ResumePDF } from "@/components/documents/ResumePDF";
import type { Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

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
    // The original upload stays permanently viewable even after editing
    // starts — a user who's begun editing shouldn't lose access to the
    // real source file they started from just because a live-edited
    // render now exists too.
    const wantsOriginal = request.nextUrl.searchParams.get("original") === "1";
    const insforge = await createInsforgeServer();

    const { data: resume } = await insforge.database
      .from("resumes")
      .select("name,storage_path,sections,style")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<{
        name: string;
        storage_path: string;
        sections: ResumeSection[] | null;
        style: ResumeStyle | null;
      }>();

    if (!resume) {
      return NextResponse.json({ error: "Résumé not found" }, { status: 404 });
    }

    // Once the résumé's own editing workspace has been touched (sections
    // saved), the live-rendered PDF from that edited content is the real
    // current document by default — the originally uploaded file is only
    // served instead when explicitly asked for via ?original=1.
    if (resume.sections && resume.style && !wantsOriginal) {
      const { data: profile } = await insforge.database
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle<Profile>();

      if (!profile) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }

      const pdfBuffer = await renderToBuffer(
        React.createElement(ResumePDF, {
          profile,
          sections: resume.sections,
          style: resume.style,
        }) as unknown as React.ReactElement<DocumentProps>,
      );

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${resume.name.replace(/[^\w.-]/g, "_")}.pdf"`,
          "Cache-Control": "no-store, must-revalidate",
        },
      });
    }

    const { data: blob, error } = await insforge.storage.from("resumes").download(resume.storage_path);

    if (error || !blob) {
      console.error("[api/resumes/[id]/download]", error);
      return NextResponse.json({ error: "Failed to download résumé" }, { status: 500 });
    }

    const buffer = await blob.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${resume.name.replace(/[^\w.-]/g, "_")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[api/resumes/[id]/download]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
