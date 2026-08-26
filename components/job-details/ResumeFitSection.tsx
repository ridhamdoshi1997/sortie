import { FileSearch, Sparkles } from "lucide-react";

import { AnalyzeResumeFitButton } from "@/components/job-details/AnalyzeResumeFitButton";
import { ResumeGapAnalysis } from "@/components/job-details/ResumeGapAnalysis";
import type { ResumeGapAnalysisResult } from "@/types";

type Props = {
  jobId: string;
  company: string;
  analysis: ResumeGapAnalysisResult | null;
};

// Model/theme selectors removed from this section (2026-08-25, direct user
// report: "irrelevant there") — they configured document generation, not
// this fit score, and sitting in this card's own header read as if they
// belonged to the score itself. ModelSelector dropped entirely (generation
// now always uses the account's stored preferred_model); ThemeSelector
// moved to DocumentGenerator.tsx's "Application Documents" header, the
// actual place a resume/cover-letter theme choice is relevant.
export function ResumeFitSection({ jobId, company, analysis }: Props) {
  if (analysis) {
    return <ResumeGapAnalysis data={analysis} />;
  }

  return (
    // Single CTA only (2026-07-28) — this used to render AnalyzeResumeFitButton
    // twice, once here and once in the empty-state body below. No other
    // empty state on this page duplicates its own CTA; kept the more
    // prominent body one, matching CompanyResearch's single-CTA empty state.
    <section className="fade-in-up border border-border bg-surface shadow-card overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-border p-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
          <FileSearch className="h-4 w-4 text-accent" />
        </div>
        <h2 className="text-base font-semibold leading-6 text-text-primary">
          Resume fit for this job
        </h2>
      </div>

      <div className="flex min-h-64 flex-col items-center justify-center px-6 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-secondary">
          <FileSearch className="h-6 w-6 text-text-muted" />
        </div>
        <p className="mt-5 text-sm font-semibold leading-5 text-text-primary">
          No analysis yet
        </p>
        <p className="mt-2 max-w-xs text-sm leading-6 text-text-muted">
          Check how well your current resume matches {company}&apos;s posting
          before you apply.
        </p>
        <div className="mt-5 flex items-center gap-2 rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent">
          <Sparkles className="h-3 w-3" />
          Scored against this posting only
        </div>
        <div className="mt-4">
          <AnalyzeResumeFitButton jobId={jobId} />
        </div>
      </div>
    </section>
  );
}
