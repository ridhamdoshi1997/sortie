import { FileSearch, Sparkles } from "lucide-react";

import { AnalyzeResumeFitButton } from "@/components/job-details/AnalyzeResumeFitButton";
import { ResumeGapAnalysis } from "@/components/job-details/ResumeGapAnalysis";
import { ModelSelector } from "@/components/shared/ModelSelector";
import { ThemeSelector } from "@/components/shared/ThemeSelector";
import type { ModelProvider } from "@/lib/models";
import type { ResumeTheme } from "@/app/api/resume/generate/ResumePDF";
import type { ResumeGapAnalysisResult } from "@/types";

type Props = {
  jobId: string;
  company: string;
  analysis: ResumeGapAnalysisResult | null;
  modelValue: ModelProvider;
  isAdmin: boolean;
  themeValue: ResumeTheme;
};

export function ResumeFitSection({
  jobId,
  company,
  analysis,
  modelValue,
  isAdmin,
  themeValue,
}: Props) {
  const settingsRow = (
    <div className="flex flex-wrap items-center gap-4">
      <ModelSelector value={modelValue} isAdmin={isAdmin} />
      <ThemeSelector value={themeValue} />
    </div>
  );

  if (analysis) {
    return <ResumeGapAnalysis data={analysis} settingsRow={settingsRow} />;
  }

  return (
    // Single CTA only (2026-07-28) — this used to render AnalyzeResumeFitButton
    // twice, once here and once in the empty-state body below. No other
    // empty state on this page duplicates its own CTA; kept the more
    // prominent body one, matching CompanyResearch's single-CTA empty state.
    //
    // Model/theme settings folded into this header (2026-07-28) — they used
    // to float on their own between InsiderConnections and this section,
    // the only uncontained controls on the whole page, which read as
    // detached from everything around them. They configure exactly what
    // this section (and Application Documents below it) generates, so this
    // is also where they actually belong, not just a fix for the floating
    // look.
    <section className="fade-in-up border border-border bg-surface shadow-card overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
            <FileSearch className="h-4 w-4 text-accent" />
          </div>
          <h2 className="text-base font-semibold leading-6 text-text-primary">
            Resume fit for this job
          </h2>
        </div>
        {settingsRow}
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
