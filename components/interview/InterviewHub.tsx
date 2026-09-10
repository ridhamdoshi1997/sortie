"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MessageSquarePlus, Search } from "lucide-react";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { ContributeQuestionModal } from "@/components/interview/ContributeQuestionModal";
import type { InterviewHubData } from "@/lib/interviewHub";

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Redesigned hub grid (2026-09-10) — inspired by, not copied from, a
// competitor's company-tier browse page: same shape (stat bar, search,
// grouped company cards, a contribute entry point), but every number here
// is real (see lib/interviewHub.ts's own comment on why), and the grouping
// is this app's own real signal (curated recognisable sections, sorted by
// real active-posting counts) rather than a claim of editorial curation we
// haven't done.
export function InterviewHub({ data, isSignedIn }: { data: InterviewHubData; isSignedIn: boolean }) {
  const [query, setQuery] = useState("");
  const [modalCompany, setModalCompany] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.sections;
    return data.sections
      .map((section) => ({
        ...section,
        companies: section.companies.filter((c) => c.companyName.toLowerCase().includes(q)),
      }))
      .filter((section) => section.companies.length > 0);
  }, [data.sections, query]);

  function openContribute(company?: string): void {
    if (!isSignedIn) {
      window.location.href = `/login?mode=signup&next=/interview-questions`;
      return;
    }
    setModalCompany(company ?? null);
    setShowModal(true);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Interview Prep
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Real interview questions, by company
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-text-secondary">
            Every question below is either generated for a real candidate&apos;s own role, or submitted by
            someone who was actually asked it. Nothing here is invented, and none of it is gated.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openContribute()}
          className="btn-signal inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-accent-foreground"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Contribute a question
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        {[
          { label: "Companies", value: data.stats.companies },
          { label: "Real Questions", value: data.stats.totalQuestions },
          { label: "Last 30 Days", value: data.stats.last30Days, prefix: "+" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-surface px-4 py-3 text-center">
            <p className="font-mono text-2xl font-bold tabular-nums text-text-primary">
              {stat.prefix ?? ""}
              {stat.value.toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="relative max-w-lg">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${data.stats.companies} compan${data.stats.companies === 1 ? "y" : "ies"}`}
          className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
        />
      </div>

      {filteredSections.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {query
            ? `No companies matching "${query}" yet — be the first to contribute one.`
            : "No question banks published yet — check back soon."}
        </p>
      ) : (
        filteredSections.map((section) => (
          <div key={section.name} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">{section.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.companies.map((company) => {
                const updated = timeAgo(company.mostRecentActivity);
                return (
                  <div
                    key={company.companyKey}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <CompanyLogo
                          company={company.companyName}
                          logoUrl={null}
                          applyUrl={company.domain ? `https://${company.domain}` : null}
                          size="sm"
                        />
                        <div>
                          <p className="font-medium text-text-primary">{company.companyName}</p>
                          {updated && <p className="text-xs text-text-muted">Updated {updated}</p>}
                        </div>
                      </div>
                      {company.activePostings > 0 && (
                        <span className="shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                          {company.activePostings} open role{company.activePostings === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>

                    {company.totalQuestions > 0 ? (
                      <Link
                        href={`/interview-questions/company/${company.companyKey}`}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        {company.totalQuestions} question{company.totalQuestions === 1 ? "" : "s"}
                        {company.aiQuestionCount > 0 && company.contributedQuestionCount > 0
                          ? " (AI-generated + contributed)"
                          : company.aiQuestionCount > 0
                            ? " (AI-generated)"
                            : " (from real candidates)"}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openContribute(company.companyName)}
                        className="text-left text-sm text-text-muted hover:text-accent hover:underline"
                      >
                        No questions yet — be the first to add one
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {showModal && (
        <ContributeQuestionModal
          onClose={() => {
            setShowModal(false);
            setModalCompany(null);
          }}
          defaultCompany={modalCompany ?? undefined}
        />
      )}
    </div>
  );
}
