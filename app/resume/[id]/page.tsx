export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { buildDefaultStyle, buildSectionsFromExtractedData } from "@/lib/resumeSections";
import { Navbar } from "@/components/layout/Navbar";
import { Tabs } from "@/components/ui/Tabs";
import { ResumeAnalysisView } from "@/components/profile/ResumeAnalysisView";
import { ResumeSlotWorkspace } from "@/components/documents/ResumeSlotWorkspace";
import type { ResumeRow } from "@/actions/resumes";
import type { Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

const RESUME_COLUMNS =
  "id,name,persona,target_job_title,storage_path,is_primary,status,extracted_data,analysis,analyzed_at,sections,style,sections_updated_at,created_at,updated_at";

type ResumeDetailRow = ResumeRow & {
  sections: ResumeSection[] | null;
  style: ResumeStyle | null;
  sections_updated_at: string | null;
};

export default async function ResumeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const [{ data: resume }, { data: profile }] = await Promise.all([
    insforge.database
      .from("resumes")
      .select(RESUME_COLUMNS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<ResumeDetailRow>(),
    insforge.database.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
  ]);

  if (!resume || !profile) {
    notFound();
  }

  // Lazily upgrade a résumé slot that predates this feature (or has never
  // had its editing workspace opened) — same "not persisted here, the
  // first real edit's save action persists it for real" pattern as the
  // tailored résumé page. A résumé that was never successfully extracted
  // (extracted_data null) starts from a genuinely blank, editable workspace
  // rather than fabricating content that was never there.
  const sections =
    resume.sections ?? (resume.extracted_data ? buildSectionsFromExtractedData(resume.extracted_data) : []);
  const style = resume.style ?? buildDefaultStyle(profile.preferred_resume_theme);

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8" style={{ width: "100%" }}>
        <Link href="/resume" className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to résumés
        </Link>

        <Tabs
          tabs={[
            { id: "report", label: "Quality Report", content: <ResumeAnalysisView resume={resume} /> },
            {
              id: "edit",
              label: "Edit & Style",
              content: (
                <ResumeSlotWorkspace
                  resumeId={resume.id}
                  profile={profile}
                  initialSections={sections}
                  initialStyle={style}
                  initialAnalysis={resume.analysis}
                  initialAnalyzedAt={resume.analyzed_at}
                  initialSectionsUpdatedAt={resume.sections_updated_at}
                />
              ),
            },
          ]}
        />
      </main>
    </>
  );
}
