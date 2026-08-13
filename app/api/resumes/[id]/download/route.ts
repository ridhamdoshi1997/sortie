import { NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const insforge = await createInsforgeServer();

    const { data: resume } = await insforge.database
      .from("resumes")
      .select("name,storage_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<{ name: string; storage_path: string }>();

    if (!resume) {
      return NextResponse.json({ error: "Résumé not found" }, { status: 404 });
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
