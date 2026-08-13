"use client";

import { useEffect, useState, useTransition } from "react";
import { BookOpen, Sparkles } from "lucide-react";

import { getOrGenerateQuestionBank } from "@/actions/interviewQuestions";
import type { QuestionBank, QuestionCategory } from "@/lib/interviewQuestions";

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  system_design: "System design",
  culture_fit: "Culture fit",
};

// Shared between the global /interview page (editable search — locked=false)
// and a job detail page's embed (pre-filled + auto-fetched — locked=true),
// per the agy research: "the exact same component used on the global page,
// but you pass it the job's company/role/seniority props" (build-plan.md
// §N/§O). Cache-backed (actions/interviewQuestions.ts) — most lookups after
// the first for any given (company, role_family, seniority) are instant,
// free reads, not a new AI call.
export function QuestionBankPanel({
  initialCompany = "",
  initialTitle = "",
  initialSeniority = "",
  locked = false,
}: {
  initialCompany?: string;
  initialTitle?: string;
  initialSeniority?: string;
  locked?: boolean;
}) {
  const [company, setCompany] = useState(initialCompany);
  const [title, setTitle] = useState(initialTitle);
  const [seniority, setSeniority] = useState(initialSeniority);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, startTransition] = useTransition();

  function runLookup(): void {
    startTransition(async () => {
      if (!company.trim() || !title.trim()) {
        setError("Enter at least a company and a role.");
        return;
      }
      setError(null);
      const result = await getOrGenerateQuestionBank(company, title, seniority);
      setHasSearched(true);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setBank(result.bank);
    });
  }

  // Auto-fetch once on mount for the locked (job-embed) case only — same
  // startTransition-wrapped-trigger pattern as CompanyResearchAutoLoader.tsx,
  // avoiding a raw synchronous setState call in the effect body.
  useEffect(() => {
    if (locked && initialCompany.trim() && initialTitle.trim()) {
      runLookup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-text-secondary" />
        <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
          Question Bank
        </h2>
      </div>

      {!locked && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-secondary p-3">
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Company</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Stripe"
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
            />
          </div>
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Role</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Software Engineer"
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
            />
          </div>
          <div className="min-w-32 flex-1">
            <label className="mb-1 block text-[11px] font-medium text-text-muted">
              Seniority (optional)
            </label>
            <input
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              placeholder="e.g. Senior"
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
            />
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={runLookup}
            className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Loading..." : "Get questions"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {loading && locked && <p className="mt-3 text-sm text-text-muted">Loading predicted questions...</p>}

      {!bank && !loading && (locked || hasSearched) && !error && (
        <p className="mt-3 text-sm text-text-muted">No questions generated yet.</p>
      )}

      {!bank && !loading && !locked && !hasSearched && (
        <p className="mt-3 text-sm text-text-muted">
          Search any company and role to see likely interview questions — before or after you apply.
        </p>
      )}

      {bank && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-r-lg border-l-2 border-agent bg-agent-light px-4 py-3">
            <p className="mb-1 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
              <Sparkles className="h-3 w-3" />
              AI-predicted, not real leaked questions
            </p>
            <p className="text-xs text-agent-dark">
              Based on {bank.company}&apos;s known industry, tech stack, and typical expectations for a{" "}
              {bank.roleFamily} role{bank.seniority !== "unspecified" ? ` at ${bank.seniority} level` : ""}.
              No source claims to have leaked or sourced these from a real interview.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {bank.questions.map((q, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface-secondary p-4">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    {CATEGORY_LABELS[q.category]}
                  </span>
                </div>
                <p className="text-sm font-medium leading-6 text-text-primary">{q.question}</p>
                <p className="mt-1.5 text-xs text-text-muted">{q.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
