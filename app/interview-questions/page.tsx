import type { Metadata } from "next";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { InterviewHub } from "@/components/interview/InterviewHub";
import { getInterviewHubData } from "@/lib/interviewHub";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Real Interview Questions by Company | Sortie",
  description:
    "Real interview questions, grouped by company — generated for real candidates' own roles, or submitted by someone who was actually asked. Nothing invented, nothing gated.",
};

export const revalidate = 3600;

// Programmatic SEO hub (build-plan.md's Phase 19 homepage research), now
// also a real crowdsourcing entry point (2026-09-10) — see
// lib/interviewHub.ts for how the grid is assembled and why every number on
// it is real.
export default async function InterviewQuestionsHubPage() {
  const [data, user] = await Promise.all([getInterviewHubData(), getCurrentUser()]);

  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-16 sm:px-6 lg:px-8">
        <InterviewHub data={data} isSignedIn={!!user} />
      </main>
      <Footer />
    </>
  );
}
