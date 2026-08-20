import { NextRequest, NextResponse } from "next/server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { toUserMessage } from "@/lib/errors";
import type { Profile } from "@/types";

type AccomplishmentExportRow = {
  title: string;
  description: string | null;
  date: string;
  tags: string[];
  source: string;
  created_at: string;
};

type JobExportRow = {
  title: string | null;
  company: string | null;
  application_status: string;
  application_status_updated_at: string | null;
  found_at: string;
};

// Obsidian markdown export (build-plan.md §G) — a single note with real
// YAML frontmatter, dropped straight into a vault. No OAuth/live-sync
// integration exists for this (Obsidian has no public cloud write API for
// a deployed web app to call) — the honest, genuinely-free version of this
// feature is a plain download, same shape as the JSON export below, just a
// different format at the same route.
function escapeYaml(value: string): string {
  return value.replace(/"/g, '\\"');
}

function buildMarkdown(
  profile: Pick<
    Profile,
    "full_name" | "current_title" | "experience_level" | "years_experience" | "skills" | "industries"
  > | null,
  accomplishments: AccomplishmentExportRow[],
  jobs: JobExportRow[],
): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Career Record"`);
  lines.push(`exported: ${new Date().toISOString()}`);
  if (profile?.full_name) lines.push(`name: "${escapeYaml(profile.full_name)}"`);
  if (profile?.current_title) lines.push(`current_title: "${escapeYaml(profile.current_title)}"`);
  lines.push("tags: [sortie, career-record]");
  lines.push("---");
  lines.push("");
  lines.push("# Career Record");
  lines.push("");

  if (profile) {
    lines.push("## Profile");
    if (profile.current_title) lines.push(`- **Current title:** ${profile.current_title}`);
    if (profile.experience_level) lines.push(`- **Experience level:** ${profile.experience_level}`);
    if (profile.years_experience != null) lines.push(`- **Years of experience:** ${profile.years_experience}`);
    if (profile.skills?.length) lines.push(`- **Skills:** ${profile.skills.join(", ")}`);
    if (profile.industries?.length) lines.push(`- **Industries:** ${profile.industries.join(", ")}`);
    lines.push("");
  }

  lines.push("## Accomplishments");
  lines.push("");
  if (accomplishments.length === 0) {
    lines.push("_None logged yet._");
  }
  for (const a of accomplishments) {
    lines.push(`### ${a.title}`);
    lines.push(`*${new Date(a.date).toLocaleDateString()}*${a.tags.length ? ` — ${a.tags.map((t) => `#${t.replace(/\s+/g, "-")}`).join(" ")}` : ""}`);
    if (a.description) {
      lines.push("");
      lines.push(a.description);
    }
    lines.push("");
  }

  lines.push("## Application History");
  lines.push("");
  if (jobs.length === 0) {
    lines.push("_No tracked applications yet._");
  }
  for (const j of jobs) {
    const updated = j.application_status_updated_at ? new Date(j.application_status_updated_at).toLocaleDateString() : "";
    lines.push(`- **${j.title ?? "Untitled role"}** at ${j.company ?? "Unknown company"} — ${j.application_status}${updated ? ` (${updated})` : ""}`);
  }
  lines.push("");

  return lines.join("\n");
}

// The literal deliverable behind "own your data" — a single JSON file
// combining everything this app knows about the user's career: their
// profile history, everything they've logged, and every real application
// outcome from the tracker. No proprietary format, no lock-in.
export async function GET(request: NextRequest): Promise<NextResponse> {
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

    if (request.nextUrl.searchParams.get("format") === "markdown") {
      const markdown = buildMarkdown(
        profile,
        (accomplishments ?? []) as AccomplishmentExportRow[],
        (jobs ?? []) as JobExportRow[],
      );
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="career-record.md"`,
          "Cache-Control": "no-store, must-revalidate",
        },
      });
    }

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
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
