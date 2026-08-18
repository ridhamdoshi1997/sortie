import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { z } from "zod";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import { BragDocPDF } from "@/components/documents/BragDocPDF";
import type { Profile } from "@/types";

// §Q4 Brag Doc download — the generated content is ephemeral (actions/bragDoc.ts
// doesn't persist it), so the client posts back exactly what
// generateBragDocAction returned rather than this route re-fetching/re-
// generating it. Body is still validated against a real schema rather than
// trusted blindly, since it's serialized JSON crossing a network boundary.
const bodySchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  bragDoc: z.object({
    summary: z.string(),
    highlights: z.array(z.object({ title: z.string(), impact: z.string() })),
    skillsShowcased: z.array(z.string()),
  }),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid brag doc payload" }, { status: 400 });
    }

    const insforge = await createInsforgeServer();
    const { data: profile } = await insforge.database
      .from("profiles")
      .select("full_name,current_title")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "full_name" | "current_title">>();

    const { startDate, endDate, bragDoc } = parsed.data;

    const buffer = await renderToBuffer(
      React.createElement(BragDocPDF, {
        fullName: profile?.full_name ?? null,
        currentTitle: profile?.current_title ?? null,
        startDate,
        endDate,
        bragDoc,
      }) as unknown as React.ReactElement<DocumentProps>,
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="brag-doc-${startDate}-to-${endDate}.pdf"`,
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/career/brag-doc]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
