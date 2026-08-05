export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { ResumeAnalysisView } from "@/components/profile/ResumeAnalysisView";
import type { ResumeRow } from "@/actions/resumes";

const RESUME_COLUMNS =
  "id,name,persona,target_job_title,storage_path,is_primary,status,extracted_data,analysis,analyzed_at,created_at,updated_at";

export default async function ResumeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: resume } = await insforge.database
    .from("resumes")
    .select(RESUME_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle<ResumeRow>();

  if (!resume) {
    notFound();
  }

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6 lg:p-8" style={{ width: "100%" }}>
        <Link href="/resume" className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to résumés
        </Link>
        <ResumeAnalysisView resume={resume} />
      </main>
    </>
  );
}
