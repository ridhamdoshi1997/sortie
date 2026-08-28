"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { searchJobsFullText, type JobSearchResult } from "@/actions/jobs";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { STATUS_CLASSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/applicationStatus";

const PREVIEW_LIMIT = 6;

// One persistent, site-wide search bar (direct user request, 2026-08-28 —
// "keep one google search type of bar throughout the site including the
// dashboard"). Deliberately NOT crammed into the existing floating Navbar
// pill (explicit user correction — "nope not on the navbar") and
// deliberately NOT duplicated into every page's own content (would mean
// editing every page/losing the "one shared bar" property) — instead
// rendered by Navbar.tsx itself as a second strip directly below the
// floating header, so it's genuinely global (Navbar is already the one
// component every authenticated page renders identically) without being
// part of that pill's own cramped icon row.
//
// Reuses the same searchJobsFullText() full-text RPC as /search
// (GlobalSearchView.tsx) — this bar is the fast preview (top 6, debounced,
// dropdown), /search is the full results page this bar's "See all" link
// and Enter key both hand off to.
export function GlobalSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();

    // Deferred via setTimeout — same idiom this codebase already uses
    // (DocumentVersionHistory.tsx, GlobalSearchView.tsx) to avoid the
    // react-hooks/set-state-in-effect cascading-render warning; also
    // doubles as the actual 300ms debounce.
    const timer = setTimeout(() => {
      if (trimmed.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      searchJobsFullText(trimmed, PREVIEW_LIMIT).then((data) => {
        setResults((prev) => (query.trim() === trimmed ? data : prev));
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function goToFullResults() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative mx-auto mt-3 w-full max-w-3xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 shadow-sm transition-colors focus-within:border-accent">
        <Search className="h-4 w-4 shrink-0 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              goToFullResults();
            }
          }}
          placeholder="Search your entire job history…"
          className="h-5 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      {showDropdown && (
        <div className="glass-panel-strong absolute left-4 right-4 top-full z-30 mt-2 overflow-hidden rounded-2xl sm:left-6 sm:right-6 lg:left-8 lg:right-8">
          {loading && <p className="px-4 py-4 text-center text-xs text-text-muted">Searching…</p>}

          {!loading && results.length === 0 && (
            <p className="px-4 py-4 text-center text-xs text-text-muted">No jobs match &ldquo;{query.trim()}&rdquo;.</p>
          )}

          {!loading && results.length > 0 && (
            <div className="max-h-96 overflow-y-auto p-1.5">
              {results.map((result) => {
                const status = result.application_status as ApplicationStatus | null;
                return (
                  <Link
                    key={result.id}
                    href={`/find-jobs/${result.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-secondary"
                  >
                    <CompanyLogo
                      company={result.company}
                      logoUrl={result.company_logo_url}
                      applyUrl={result.external_apply_url}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">{result.title ?? "Untitled role"}</p>
                      <p className="truncate text-xs text-text-muted">{result.company ?? "Unknown company"}</p>
                    </div>
                    {status && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASSES[status]}`}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={goToFullResults}
            className="block w-full border-t border-border px-4 py-2.5 text-center text-xs font-medium text-accent transition-colors hover:bg-surface-secondary"
          >
            See all results for &ldquo;{query.trim()}&rdquo;
          </button>
        </div>
      )}
    </div>
  );
}
