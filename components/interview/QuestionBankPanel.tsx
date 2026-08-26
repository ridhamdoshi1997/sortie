"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, Code2, Copy, Loader2, Search, X } from "lucide-react";

import { getOrGenerateQuestionBank, getQuestionDetails, getPracticeKit } from "@/actions/interviewQuestions";
import { PracticeSandbox } from "@/components/interview/PracticeSandbox";
import type { InterviewQuestion, PracticeKit, QuestionBank, QuestionCategory, QuestionDetails } from "@/lib/interviewQuestions";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { CompanyLogo } from "@/components/shared/CompanyLogo";

export type QuickStartJob = { company: string; title: string; logoUrl: string | null };

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
//
// Category pills (progressive disclosure) + a Study View modal for each
// question's deep content added 2026-08-14, per agy research: don't show
// 10-15 questions flat, and don't inline-expand a card into a wall of
// tips/code/text — a focused modal reading view keeps the list scannable.
export function QuestionBankPanel({
  initialCompany = "",
  initialTitle = "",
  initialSeniority = "",
  locked = false,
  quickStartJobs = [],
}: {
  initialCompany?: string;
  initialTitle?: string;
  initialSeniority?: string;
  locked?: boolean;
  /** Real (company, title) pairs from the user's own tracked jobs
   * (app/interview/page.tsx) — an honest "browse by company" grid, per agy
   * research (2026-08-26) on how real interview-prep products expose
   * company-directory browsing. Real data only, never fabricated stats. */
  quickStartJobs?: QuickStartJob[];
}) {
  const [company, setCompany] = useState(initialCompany);
  const [title, setTitle] = useState(initialTitle);
  const [seniority, setSeniority] = useState(initialSeniority);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeCategory, setActiveCategory] = useState<QuestionCategory | "all">("all");
  const [studyIndex, setStudyIndex] = useState<number | null>(null);
  const [showManualSearch, setShowManualSearch] = useState(locked || quickStartJobs.length === 0);
  const [loading, startTransition] = useTransition();

  // Accepts explicit overrides so a quick-start card click can search
  // immediately with real values, without waiting on the next render for
  // `company`/`title` state to catch up (they're set in the same handler).
  function runLookup(companyOverride?: string, titleOverride?: string): void {
    const searchCompany = companyOverride ?? company;
    const searchTitle = titleOverride ?? title;
    startTransition(async () => {
      if (!searchCompany.trim() || !searchTitle.trim()) {
        setError("Enter at least a company and a role.");
        return;
      }
      setError(null);
      const result = await getOrGenerateQuestionBank(searchCompany, searchTitle, seniority);
      setHasSearched(true);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setBank(result.bank);
      setActiveCategory("all");
    });
  }

  function handleQuickStart(job: QuickStartJob): void {
    setCompany(job.company);
    setTitle(job.title);
    if (job.title.trim()) {
      runLookup(job.company, job.title);
    } else {
      // No real title on record for this company — land the user in the
      // manual form with Company pre-filled rather than guessing a role.
      setShowManualSearch(true);
    }
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

  const presentCategories = bank
    ? (Array.from(new Set(bank.questions.map((q) => q.category))) as QuestionCategory[])
    : [];
  const visibleQuestions =
    bank && activeCategory !== "all" ? bank.questions.filter((q) => q.category === activeCategory) : (bank?.questions ?? []);

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-text-secondary" />
        <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
          Question Bank
        </h2>
      </div>

      {/* Real "browse by company" grid — restructured 2026-08-26 (agy
         research + direct user request): a text form asking the user to
         retype a company/role they already have tracked was real friction
         for the single most common case. This is the primary interaction
         now; the manual form drops to a secondary "search a different
         company" affordance below it. Cards, not chips — company logo +
         real role title, one click straight into results. Never fabricated
         stats/counts, only the user's own real job data. */}
      {!locked && !bank && quickStartJobs.length > 0 && (
        <div className="mt-4">
          <p className="mb-2.5 text-[11px] font-medium text-text-muted">Practice for a company you&apos;re tracking</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {quickStartJobs.map((job, i) => (
              <button
                key={job.company}
                type="button"
                disabled={loading}
                onClick={() => handleQuickStart(job)}
                className="dim-card-in flex items-center gap-3 rounded-xl border border-border bg-surface-secondary p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent disabled:cursor-wait disabled:opacity-60"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <CompanyLogo company={job.company} logoUrl={job.logoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{job.company}</p>
                  <p className="truncate text-xs text-text-muted">{job.title || "Any role"}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!locked && (quickStartJobs.length === 0 || showManualSearch || bank) && (
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
            onClick={() => runLookup()}
            className="btn-signal h-10 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            {loading ? "Loading..." : "Get questions"}
          </button>
        </div>
      )}

      {!locked && !bank && quickStartJobs.length > 0 && !showManualSearch && (
        <button
          type="button"
          onClick={() => setShowManualSearch(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-accent"
        >
          <Search className="h-3 w-3" />
          Search a different company
        </button>
      )}

      {loading && !locked && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading questions for {company}…
        </p>
      )}

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {loading && locked && <p className="mt-3 text-sm text-text-muted">Loading predicted questions...</p>}

      {!bank && !loading && (locked || hasSearched) && !error && (
        <p className="mt-3 text-sm text-text-muted">No questions generated yet.</p>
      )}

      {!bank && !loading && !locked && !hasSearched && quickStartJobs.length === 0 && (
        <p className="mt-3 text-sm text-text-muted">
          Search any company and role to see likely interview questions — before or after you apply.
        </p>
      )}

      {bank && (
        <div className="mt-4 flex flex-col gap-3">
          <AiReadsCard label="AI-predicted, not real leaked questions">
            <p className="text-xs leading-5 text-text-secondary">
              Based on {bank.company}&apos;s known industry, tech stack, and typical expectations for a{" "}
              {bank.roleFamily} role{bank.seniority !== "unspecified" ? ` at ${bank.seniority} level` : ""}.
              No source claims to have leaked or sourced these from a real interview. Click any question
              for a full guided study card.
            </p>
          </AiReadsCard>

          {presentCategories.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeCategory === "all"
                    ? "bg-accent/15 text-accent"
                    : "border border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                All
              </button>
              {presentCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activeCategory === cat
                      ? "bg-accent/15 text-accent"
                      : "border border-border text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {visibleQuestions.map((q, i) => {
              const index = bank.questions.indexOf(q);
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setStudyIndex(index)}
                  className="dim-card-in rounded-xl border border-border bg-surface-secondary p-4 text-left transition-colors hover:border-accent"
                  style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        {CATEGORY_LABELS[q.category]}
                      </span>
                      {/* Immediate exposure of the live code editor, right on
                         the list row (agy research, 2026-08-26: real
                         platforms make the coding sandbox obvious before a
                         user ever opens a question, not something they
                         discover by accident deep in a detail view). */}
                      {q.category === "technical" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-agent-light px-2 py-0.5 text-[10px] font-medium text-agent-dark">
                          <Code2 className="h-3 w-3" />
                          Code editor
                        </span>
                      )}
                    </div>
                    {q.details !== undefined && (
                      <span className="text-[10px] font-medium text-accent">Study card ready</span>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-6 text-text-primary">{q.question}</p>
                  <p className="mt-1.5 text-xs text-text-muted">{q.rationale}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {bank && studyIndex !== null && (
        <StudyView
          bankId={bank.id}
          questionIndex={studyIndex}
          question={bank.questions[studyIndex]}
          onClose={() => setStudyIndex(null)}
          onDetailsLoaded={(details) => {
            setBank((prev) => {
              if (!prev) return prev;
              const questions = [...prev.questions];
              questions[studyIndex] = { ...questions[studyIndex], details };
              return { ...prev, questions };
            });
          }}
        />
      )}
    </section>
  );
}

function StudyView({
  bankId,
  questionIndex,
  question,
  onClose,
  onDetailsLoaded,
}: {
  bankId: string;
  questionIndex: number;
  question: InterviewQuestion;
  onClose: () => void;
  onDetailsLoaded: (details: QuestionDetails) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Practice Sandbox — separate load, only ever triggered by an explicit
  // click on "Practice this question" (technical questions only), not
  // auto-fetched alongside the study card's own details. Kept local to this
  // one StudyView instance rather than lifted into the bank's own state
  // (unlike `details` above) — a practice session is scratch/ephemeral UI
  // state, not something worth persisting across a re-open the way the
  // study card's text content is.
  const [practiceKit, setPracticeKit] = useState<PracticeKit | null>(question.practiceKit ?? null);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [practiceLoading, startPracticeTransition] = useTransition();

  useEffect(() => {
    if (question.details === undefined) {
      startTransition(async () => {
        const result = await getQuestionDetails(bankId, questionIndex);
        if (!result.success) {
          setError(result.error);
          return;
        }
        onDetailsLoaded(result.details);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOpenPractice(): void {
    setPracticeError(null);
    setPracticeOpen(true);
    if (practiceKit) return;
    startPracticeTransition(async () => {
      const result = await getPracticeKit(bankId, questionIndex);
      if (!result.success) {
        setPracticeError(result.error);
        setPracticeOpen(false);
        return;
      }
      setPracticeKit(result.practiceKit);
    });
  }

  function handleCopy(code: string): void {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const details = question.details;

  // Portaled to document.body — this panel can be mounted from deep inside
  // a job-details page's `.fade-in-up`-animated tab tree (app/globals.css),
  // and a `transform`-bearing ancestor with `animation-fill-mode: both`
  // permanently establishes a new containing block, which silently breaks
  // `position: fixed` for any descendant (confirmed live: the backdrop
  // rendered at the ancestor's scroll-relative offset instead of the
  // viewport). Portaling escapes that regardless of where this is mounted
  // from — same fix class this codebase already uses for portal-clipping
  // bugs elsewhere (see ui-rules.md / the Dropdown component's history).
  return createPortal(
    <div
      className="animate-in fade-in-0 fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm duration-200"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-in slide-in-from-right-8 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-surface p-6 shadow-2xl duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              {CATEGORY_LABELS[question.category]}
            </span>
            <h2 className="mt-2 text-lg font-semibold leading-6 text-text-primary">{question.question}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-text-secondary">{question.rationale}</p>

        {loading && <p className="mt-6 text-sm text-text-muted">Building your study card...</p>}
        {error && <p className="mt-6 text-xs text-error">{error}</p>}

        {details && (
          <div className="mt-6 flex flex-col gap-4">
            {details.type === "technical" && (
              <>
                {/* Practice comes FIRST, hints/reference solution after
                   (2026-08-26, direct user report + agy research on real
                   interview-prep products: the editor should be immediately
                   adjacent to the question, not the last thing after
                   scrolling past a worked solution that spoils the
                   exercise). Still a real click to open, not auto-fired on
                   mount — getPracticeKit is a real AI call, and every other
                   opt-in AI action on this app (Strategic Moat Briefing,
                   Trap Door Predictor, etc.) stays a deliberate click for
                   exactly that reason; the fix here is visual position
                   (first, not buried), not removing the click itself. */}
                {!practiceOpen && !practiceKit && (
                  <button
                    type="button"
                    onClick={handleOpenPractice}
                    disabled={practiceLoading}
                    className="btn-signal inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-accent-foreground disabled:opacity-60"
                  >
                    {practiceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
                    {practiceLoading ? "Building your exercise…" : "Open code editor"}
                  </button>
                )}
                {practiceError && <p className="text-xs text-error">{practiceError}</p>}
                {practiceOpen && practiceKit && (
                  <PracticeSandbox
                    practiceKit={practiceKit}
                    storageKey={`${bankId}:${questionIndex}`}
                    onClose={() => setPracticeOpen(false)}
                  />
                )}

                <div className="flex items-center gap-2 pt-1">
                  <span className="h-px flex-1 bg-border-light" />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Hints &amp; reference solution
                  </span>
                  <span className="h-px flex-1 bg-border-light" />
                </div>

                <InsiderTipsBlock
                  items={[
                    ["What they're really testing", details.insiderTips.whatTheyTest],
                    ["Common pitfall", details.insiderTips.commonPitfall],
                  ]}
                  bullets={details.insiderTips.edgeCases.length > 0 ? { label: "Edge cases", items: details.insiderTips.edgeCases } : undefined}
                />
                <ApproachSteps steps={details.approachSteps} />
                <div className="rounded-xl border border-border bg-surface-secondary p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      AI reference implementation ({details.solution.language})
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(details.solution.code)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded-lg bg-surface p-3 text-xs leading-5 text-text-primary">
                    <code>{details.solution.code}</code>
                  </pre>
                  <p className="mt-2 text-xs text-text-muted">
                    Time: {details.solution.timeComplexity} · Space: {details.solution.spaceComplexity}
                  </p>
                </div>
              </>
            )}

            {details.type === "system_design" && (
              <>
                <InsiderTipsBlock
                  items={[
                    ["What they're really testing", details.insiderTips.whatTheyTest],
                    ["Common pitfall", details.insiderTips.commonPitfall],
                  ]}
                />
                <ApproachSteps steps={details.approachSteps} />
                <div className="rounded-xl border border-border bg-surface-secondary p-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    AI reference design walkthrough
                  </p>
                  <p className="text-sm leading-6 text-text-primary">{details.solutionOutline}</p>
                </div>
              </>
            )}

            {(details.type === "behavioral" || details.type === "culture_fit") && (
              <>
                <InsiderTipsBlock
                  items={[["What they're looking for", details.insiderTips.whatTheyLookFor]]}
                  bullets={
                    details.insiderTips.redFlags.length > 0
                      ? { label: "Red flags to avoid", items: details.insiderTips.redFlags }
                      : undefined
                  }
                />
                <div className="rounded-xl border border-border bg-surface-secondary p-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Structuring your answer — AI strategy guide
                  </p>
                  <p className="text-sm font-medium text-text-primary">{details.starFramework.situationPrompt}</p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-text-muted">
                    Make sure your Action highlights
                  </p>
                  <ul className="mt-1 flex flex-col gap-1.5 text-sm text-text-primary">
                    {details.starFramework.actionStrategies.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-text-muted">
                    Quantify your Result with
                  </p>
                  <ul className="mt-1 flex flex-col gap-1.5 text-sm text-text-primary">
                    {details.starFramework.impactMetrics.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            <p className="text-xs text-text-muted">
              Generated by Sortie AI. This is a synthesized reference based on common industry patterns
              for this role, intended for practice purposes — not a verified real answer key.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function InsiderTipsBlock({
  items,
  bullets,
}: {
  items: [string, string][];
  bullets?: { label: string; items: string[] };
}) {
  return (
    <AiReadsCard variant="compact" label="Insider tips">
      {items.map(([label, value]) => (
        <p key={label} className="text-sm leading-6 text-text-primary">
          <span className="font-medium">{label}:</span> {value}
        </p>
      ))}
      {bullets && (
        <div className="mt-2">
          <p className="text-xs font-medium text-text-primary">{bullets.label}:</p>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-text-secondary">
            {bullets.items.map((b, i) => (
              <li key={i}>• {b}</li>
            ))}
          </ul>
        </div>
      )}
    </AiReadsCard>
  );
}

function ApproachSteps({ steps }: { steps: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">The approach</p>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-light text-[11px] font-semibold text-accent">
              {i + 1}
            </span>
            <span className="text-sm leading-5 text-text-primary">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
