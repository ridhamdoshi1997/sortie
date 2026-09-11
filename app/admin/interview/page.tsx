import { redirect } from "next/navigation";

import { getAdminRoster } from "@/actions/admin";
import { loadInterviewAdmin } from "@/actions/adminInterview";
import { InterviewModerationDashboard } from "@/components/admin/InterviewModerationDashboard";

export const dynamic = "force-dynamic";

// Interview content admin (Phase 52, section 4) — the moderation surface
// contributed_interview_questions shipped without. Its own migration said to
// build this "the moment this needs moderating"; public UGC rendering on
// unauthenticated SEO pages with no review step is that moment.
export default async function AdminInterviewPage() {
  const [interviewResult, rosterResult] = await Promise.all([loadInterviewAdmin(), getAdminRoster()]);

  if (!interviewResult.success || !rosterResult.success) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Interview</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Review what candidates submit before it reaches a public company page, add questions directly, and see which
          companies are carried by real contributions versus AI-generated banks.
        </p>
      </div>
      <InterviewModerationDashboard initialData={interviewResult.data} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
