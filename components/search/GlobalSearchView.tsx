"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { searchJobsFullText, type JobSearchResult } from "@/actions/jobs";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { STATUS_CLASSES, STATUS_LABELS } from "@/lib/applicationStatus";
import { formatDate } from "@/lib/utils";
import type { ApplicationStatus } from "@/lib/applicationStatus";

function scoreTierClass(score: number) {
  if (score >= 80) return "text-agent-dark";
  if (score >= 60) return "text-text-primary";
  return "text-text-muted";
}

// Splits ts_headline's output on the literal <mark>/</mark> markers this
// app chose as StartSel/StopSel (migration 20260828180000) and renders each
// piece as a real React text node wrapped in a real <mark> element where
// matched — deliberately NOT dangerouslySetInnerHTML. The source text
// behind a snippet (about_role/description) originates from scraped
// third-party job postings, so treating ts_headline's output as trusted
// HTML would be a real stored-XSS vector if a posting's raw text ever
// happened to contain HTML-like characters; string-splitting on markers we
// control and letting React escape everything else avoids that entirely.
function renderSnippet(snippet: string | null): ReactNode {
  if (!snippet) return null;
  const parts = snippet.split(/(<mark>|<\/mark>)/);
  const nodes: ReactNode[] = [];
  let highlighting = false;
  parts.forEach((part, i) => {
    if (part === "<mark>") {
      highlighting = true;
      return;
    }
    if (part === "</mark>") {
      highlighting = false;
      return;
    }
    if (!part) return;
    nodes.push(
      highlighting ? (
        <mark key={i} className="rounded-sm bg-accent/20 text-text-primary">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  });
  return nodes;
}

function SearchResultRow({ result }: { result: JobSearchResult }) {
  const status = result.application_status as ApplicationStatus | null;
  return (
    <a
      href={`/find-jobs/${result.id}`}
      className="signal-track"
    >
      <span className="signal-dot" />
      <CompanyLogo
        company={result.company}
        logoUrl={result.company_logo_url}
        applyUrl={result.external_apply_url}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{result.title ?? "Untitled role"}</p>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          {[result.company, result.location].filter(Boolean).join(" · ") || "Unknown company"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {status && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_CLASSES[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
          )}
          <span className="text-[10.5px] text-text-muted">{formatDate(result.found_at)}</span>
        </div>
        {result.snippet && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-text-secondary">{renderSnippet(result.snippet)}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {result.match_score !== null ? (
          <>
            <div className={`font-mono text-lg font-bold leading-none tabular-nums ${scoreTierClass(result.match_score)}`}>
              {result.match_score}%
            </div>
            <div className="mt-1 font-mono text-[9.5px] uppercase tracking-wide text-text-muted">Match</div>
          </>
        ) : (
          <span className="font-mono text-xs text-text-muted">Scoring…</span>
        )}
      </div>
    </a>
  );
}

// Global full-text search (build-plan.md §H's "Global search" row — deliberately
// distinct from Cmd+K's quickSearchJobs, which only jumps to a title/company
// match; this searches everything: description, requirements, personal
// notes, tags, the private "why I left" reflection). 300ms debounce + a
// stale-response guard, same idiom CommandPalette.tsx already established
// for its own debounced job search.
export function GlobalSearchView({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(initialQuery.trim().length >= 2);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    // Keep the URL's ?q= in sync so a search is shareable/refreshable —
    // replace (not push) so debounced keystrokes don't spam browser history.
    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    router.replace(`/search${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });

    // Every setState below is deferred into this one timeout — same idiom
    // this codebase already uses (DocumentVersionHistory.tsx) to avoid the
    // react-hooks/set-state-in-effect cascading-render warning; it also
    // doubles as the actual 300ms debounce.
    const timer = setTimeout(() => {
      if (trimmed.length < 2) {
        setResults([]);
        setSearched(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      searchJobsFullText(trimmed).then((data) => {
        setResults((prev) => (query.trim() === trimmed ? data : prev));
        setSearched((prev) => (query.trim() === trimmed ? true : prev));
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router/searchParams intentionally excluded, only `query` should retrigger the search
  }, [query]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your entire job history — title, company, description, notes…"
          className="h-6 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      {query.trim().length > 0 && query.trim().length < 2 && (
        <p className="text-center text-xs text-text-muted">Keep typing — at least 2 characters.</p>
      )}

      {loading && <p className="text-center text-xs text-text-muted">Searching…</p>}

      {!loading && searched && results.length === 0 && (
        <p className="text-center text-sm text-text-muted">No jobs match &ldquo;{query.trim()}&rdquo;.</p>
      )}

      {results.length > 0 && (
        <div className="signal-rail">
          {results.map((result) => (
            <SearchResultRow key={result.id} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}
