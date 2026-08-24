import type { Metadata } from "next";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AtsCheckerForm } from "@/components/tools/AtsCheckerForm";

export const metadata: Metadata = {
  title: "Free ATS Resume Score Checker — Sortie",
  description: "Paste your resume and get a free, honest ATS-compatibility read — formatting risks, keyword coverage against a job description, and concrete suggestions. No signup required.",
};

// Free ATS score checker (build-plan.md §I, no-login lead magnet) —
// genuinely public, no requireUser() anywhere on this page or its API
// route. Real per-IP daily cap (app/api/tools/ats-check/route.ts) is the
// abuse/cost guard, not a login wall.
export default function AtsCheckerPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-text-primary">Free ATS Resume Score Checker</h1>
          <p className="mx-auto mt-3 max-w-xl text-text-secondary">
            Paste your resume text below for a free, honest read on formatting risk and keyword coverage — no
            signup required. 3 free checks per day.
          </p>
        </div>
        <AtsCheckerForm />
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
