"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, Code2, Copy, Loader2, Search, X } from "lucide-react";

import { getOrGenerateQuestionBank, getQuestionDetails, getPracticeKit } from "@/actions/interviewQuestions";
import { listContributedQuestionsByCompanyKey, type ContributedQuestion } from "@/actions/interviewContributions";
import { PracticeSandbox } from "@/components/interview/PracticeSandbox";
import { ContributeQuestionModal } from "@/components/interview/ContributeQuestionModal";
import { ANY_ROLE } from "@/lib/interviewQuestions";
import type { InterviewQuestion, PracticeKit, QuestionBank, QuestionCategory, QuestionDetails } from "@/lib/interviewQuestions";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { toCompanyKey } from "@/lib/atsRegistry";
import { MessageSquarePlus, MessageSquare } from "lucide-react";
import type { InterviewHubData } from "@/lib/interviewHub";

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
  hubData,
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
  /** Real company grid + stat counts for the browse view (lib/interviewHub.ts).
   * Omitted on the job-detail embed (locked=true), which has no browse view. */
  hubData?: InterviewHubData;
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

  // Real, human-submitted questions for the currently-loaded bank's company
  // (actions/interviewContributions.ts) — the "contribute on top of what we
  // already have" addition, 2026-09-10. Kept separate from `bank.questions`
  // rather than merged into one list: those are AI-predicted, these are a
  // real candidate reporting a question they were actually asked, and
  // mixing the two would blur exactly the distinction ui-tokens.md's
  // Invariants section treats as a hard line (agent-teal is reserved
  // exclusively for AI-generated content).
  const [contributed, setContributed] = useState<ContributedQuestion[]>([]);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [browseQuery, setBrowseQuery] = useState("");

  // The browse grid's real content, in one list: the user's OWN tracked
  // companies first (the most common real case — practising for something
  // they're actually pursuing), then the wider company grid from
  // lib/interviewHub.ts. A company the user tracks is never duplicated into
  // the lower sections. Clicking any card runs this panel's own AI lookup —
  // no navigation away, same behaviour the quick-start grid always had.
  const browseSections = useMemo(() => {
    const q = browseQuery.trim().toLowerCase();
    const tracked = new Set(quickStartJobs.map((j) => j.company.toLowerCase()));

    const sections: {
      name: string;
      companies: {
        company: string;
        title: string;
        logoUrl: string | null;
        applyUrl: string | null;
        activePostings: number;
        totalQuestions: number;
      }[];
    }[] = [];

    if (quickStartJobs.length > 0) {
      sections.push({
        name: "Companies you're tracking",
        companies: quickStartJobs.map((j) => ({
          company: j.company,
          title: j.title,
          logoUrl: j.logoUrl,
          applyUrl: null,
          activePostings: 0,
          totalQuestions: 0,
        })),
      });
    }

    for (const section of hubData?.sections ?? []) {
      sections.push({
        name: section.name,
        companies: section.companies
          .filter((c) => !tracked.has(c.companyName.toLowerCase()))
          .map((c) => ({
            company: c.companyName,
            title: "",
            logoUrl: null,
            applyUrl: c.domain ? `https://${c.domain}` : null,
            activePostings: c.activePostings,
            totalQuestions: c.totalQuestions,
          })),
      });
    }

    return sections
      .map((s) => ({ ...s, companies: q ? s.companies.filter((c) => c.company.toLowerCase().includes(q)) : s.companies }))
      .filter((s) => s.companies.length > 0);
  }, [browseQuery, quickStartJobs, hubData]);

  // Accepts explicit overrides so a quick-start card click can search
  // immediately with real values, without waiting on the next render for
  // `company`/`title` state to catch up (they're set in the same handler).
  function runLookup(companyOverride?: string, titleOverride?: string): void {
    const searchCompany = companyOverride ?? company;
    const searchTitle = titleOverride ?? title;
    startTransition(async () => {
      // Company only — role is optional (2026-09-10). Clicking a company in
      // the grid above passes no title at all and still returns a real
      // company-wide bank; see ANY_ROLE in lib/interviewQuestions.ts.
      if (!searchCompany.trim()) {
        setError("Enter a company.");
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
      // Free, cheap read — no AI call, just the same company_key lookup
      // the /interview-questions hub uses. Runs alongside the AI bank
      // fetch rather than gating it, so a slow/failed contributed-question
      // read never blocks the predicted questions from showing.
      listContributedQuestionsByCompanyKey(toCompanyKey(searchCompany))
        .then(setContributed)
        .catch(() => setContributed([]));
    });
  }

  function handleQuickStart(job: QuickStartJob): void {
    setCompany(job.company);
    setTitle(job.title);
    // Always runs, with or without a role (2026-09-10, direct user
    // instruction). It used to dump the user into the manual form whenever
    // the company had no title on record — which is every company in the
    // curated grid, so clicking Google did nothing but show a form. A
    // company with no role now returns that company's own culture/business/
    // behavioural questions instead.
    runLookup(job.company, job.title);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-text-secondary" />
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
            Question Bank
          </h2>
        </div>
        {!locked && (
          <button
            type="button"
            onClick={() => setShowContributeModal(true)}
            className="btn-signal inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-accent-foreground"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Contribute a question
          </button>
        )}
      </div>

      {/* Browse-by-company, redesigned 2026-09-10 (direct user request, with
         a competitor's company-directory page as the reference). One
         section, not two: the stat strip, the company search and the
         grouped company grid all live inside this panel, and clicking any
         card runs the same AI lookup this panel has always run. Every number
         is real — see lib/interviewHub.ts for where each comes from and why
         no company is listed without real backing. */}
      {!locked && !bank && (
        <>
          {hubData && (
            <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
              {[
                { label: "Companies", value: hubData.stats.companies },
                { label: "Real Questions", value: hubData.stats.totalQuestions },
                { label: "Last 30 Days", value: hubData.stats.last30Days, prefix: "+" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border bg-surface-secondary px-4 py-3 text-center">
                  <p className="font-mono text-2xl font-bold tabular-nums text-text-primary">
                    {stat.prefix ?? ""}
                    {stat.value.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={browseQuery}
              onChange={(e) => setBrowseQuery(e.target.value)}
              placeholder="Search a company…"
              className="h-11 w-full rounded-lg border border-border bg-surface-secondary pl-10 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
            />
          </div>

          <div className="mt-5 flex flex-col gap-5">
            {browseSections.map((section) => (
              <div key={section.name}>
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {section.name}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {section.companies.map((entry, i) => (
                    <button
                      key={`${section.name}:${entry.company}`}
                      type="button"
                      disabled={loading}
                      onClick={() => handleQuickStart({ company: entry.company, title: entry.title, logoUrl: entry.logoUrl })}
                      className="dim-card-in flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-card disabled:cursor-wait disabled:opacity-60"
                      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <CompanyLogo company={entry.company} logoUrl={entry.logoUrl} applyUrl={entry.applyUrl} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-text-primary">{entry.company}</p>
                            <p className="truncate text-xs text-text-muted">{entry.title || "Any role"}</p>
                          </div>
                        </div>
                        {entry.activePostings > 0 && (
                          <span className="shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                            {entry.activePostings} open
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">
                        {entry.totalQuestions > 0
                          ? `${entry.totalQuestions} real question${entry.totalQuestions === 1 ? "" : "s"} on file`
                          : "Generate AI-predicted questions"}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {browseSections.length === 0 && (
              <p className="text-sm text-text-muted">
                No companies matching &ldquo;{browseQuery}&rdquo; — search it below to generate a question bank
                for it anyway.
              </p>
            )}
          </div>
        </>
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
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Role (optional)</label>
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
          Search any company to see likely interview questions — add a role to narrow them, or leave it blank for company-wide ones.
        </p>
      )}

      {bank && (
        <div className="mt-4 flex flex-col gap-3">
          <AiReadsCard label="AI-predicted, not real leaked questions">
            <p className="text-xs leading-5 text-text-secondary">
              Based on {bank.company}&apos;s known industry, tech stack, and{" "}
              {bank.roleFamily === ANY_ROLE
                ? "what it tends to ask candidates across roles — add a role above to narrow these"
                : `typical expectations for a ${bank.roleFamily} role${bank.seniority !== "unspecified" ? ` at ${bank.seniority} level` : ""}`}
              . No source claims to have leaked or sourced these from a real interview. Click any question
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

          {/* Real, human-submitted questions — additive to the AI-predicted
             bank above, never merged into it. Shown even when empty, with
             a direct contribute CTA, so this is a visible "on top of what
             we already have" feature rather than something a user has to
             already know exists (2026-09-10). */}
          <div className="rounded-xl border border-border bg-surface-secondary p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                From real candidates
              </p>
              <button
                type="button"
                onClick={() => setShowContributeModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Contribute a question
              </button>
            </div>
            {contributed.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">
                No real questions submitted for {bank.company} yet — if you&apos;ve interviewed here, add
                one.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {contributed.map((q) => (
                  <div key={q.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        {q.role}
                      </span>
                    </div>
                    <p className="mt-1.5 flex items-start gap-1.5 text-sm leading-5 text-text-primary">
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                      {q.question}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showContributeModal && (
        <ContributeQuestionModal onClose={() => setShowContributeModal(false)} defaultCompany={bank?.company} />
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
