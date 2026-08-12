import { NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import type { Profile } from "@/types";

// The literal deliverable behind "own your data" — a single JSON file
// combining everything this app knows about the user's career: their
// profile history, everything they've logged, and every real application
// outcome from the tracker. No proprietary format, no lock-in.
export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const insforge = await createInsforgeServer();

    const [{ data: profile }, { data: accomplishments }, { data: jobs }] = await Promise.all([
      insforge.database.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
      insforge.database
        .from("accomplishments")
        .select("title,description,date,tags,source,created_at")
        .eq("user_id", user.id)
        .order("date", { ascending: false }),
      insforge.database
        .from("jobs")
        .select("title,company,application_status,application_status_updated_at,found_at")
        .eq("user_id", user.id)
        .neq("application_status", "draft")
        .order("application_status_updated_at", { ascending: false }),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      profile: profile
        ? {
            fullName: profile.full_name,
            currentTitle: profile.current_title,
            experienceLevel: profile.experience_level,
            yearsExperience: profile.years_experience,
            skills: profile.skills,
            industries: profile.industries,
            workExperience: profile.work_experience,
            education: profile.education,
            certifications: profile.certifications,
          }
        : null,
      accomplishments: accomplishments ?? [],
      applicationHistory: jobs ?? [],
    };

    const body = JSON.stringify(exportPayload, null, 2);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="career-record.json"`,
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[api/career/export]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
