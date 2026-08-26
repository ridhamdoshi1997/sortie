"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { bulkSetUserTester, getUsersPage } from "@/actions/admin";
import type { UserListPage } from "@/lib/admin/queries";

const PAGE_SIZE = 25;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Full searchable/paginated user table — the v1.1 gap flagged after v1
// shipped with only a top-20-by-usage leaderboard. Server-side pagination
// (lib/admin/queries.ts's listUsers uses .range(), not fetch-all-then-
// slice), so this stays fine well past today's user count.
export function UsersTable({ initialData }: { initialData: UserListPage }) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE));
  const allOnPageSelected = data.rows.length > 0 && data.rows.every((u) => selected.has(u.userId));

  function fetchPage(nextPage: number, nextSearch: string): void {
    setError(null);
    startTransition(async () => {
      const result = await getUsersPage(nextPage, nextSearch);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setData(result.data);
      setPage(nextPage);
      setSelected(new Set());
    });
  }

  function handleSearchSubmit(e: React.FormEvent): void {
    e.preventDefault();
    fetchPage(1, search);
  }

  function toggleRow(userId: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleAllOnPage(): void {
    setSelected((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        for (const u of data.rows) next.delete(u.userId);
        return next;
      }
      return new Set([...prev, ...data.rows.map((u) => u.userId)]);
    });
  }

  // Bulk "Mark as tester" (direct user request, approved plan §1) — first
  // real use of the checkbox multi-select + floating action bar pattern
  // that the admin-redesign phase will extend to other tables.
  function bulkMarkTester(isTester: boolean): void {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const ids = Array.from(selected);
      const result = await bulkSetUserTester(ids, isTester);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setData((prev) => ({ ...prev, rows: prev.rows.map((u) => (selected.has(u.userId) ? { ...u, isTester } : u)) }));
      setSelected(new Set());
    });
  }

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <form onSubmit={handleSearchSubmit} className="mb-4 flex max-w-sm items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name"
            className="h-10 w-full rounded-md border border-border bg-surface-secondary pl-9 pr-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="btn-signal h-10 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          Search
        </button>
      </form>

      {error && <p className="mb-2 text-xs text-error">{error}</p>}

      {selected.size > 0 && (
        // Response to a real user action (checking a row), not ambient
        // load-time motion — this is the one animation this table earns per
        // the site's own frequency-gate discipline (an entrance stagger on
        // every page load would be wrong for a screen an operator visits
        // many times a day; a bar reacting to a selection they just made is
        // fine either way).
        <div className="animate-in fade-in-0 slide-in-from-top-1 mb-3 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-light/30 px-4 py-2.5 duration-200 ease-out">
          <span className="text-xs font-medium text-text-primary">{selected.size} selected</span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => bulkMarkTester(true)}
            className="btn-signal ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-60"
          >
            Mark as tester
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => bulkMarkTester(false)}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
          >
            Remove tester
          </button>
        </div>
      )}

      {/* Operate-mode density (Phase 26, admin-redesign Phase 2) — same
         py-2.5 rows + sticky header + row-hover as SupportInbox.tsx; kept
         identical between the two so switching between /admin/support and
         /admin/users doesn't feel like two different products. */}
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 bg-surface-secondary">
              <th className="px-5 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  aria-label="Select all users on this page"
                  className="h-3.5 w-3.5 rounded border-border accent-accent"
                />
              </th>
              {["User", "Joined", "Status", "Tester", "Usage multiplier"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-sm text-text-muted">
                  No users match this search.
                </td>
              </tr>
            ) : (
              data.rows.map((u) => (
                <tr key={u.userId} className="border-t border-border transition-colors hover:bg-surface-secondary/60">
                  <td className="px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(u.userId)}
                      onChange={() => toggleRow(u.userId)}
                      aria-label={`Select ${u.email ?? u.userId}`}
                      className="h-3.5 w-3.5 rounded border-border accent-accent"
                    />
                  </td>
                  <td className="px-5 py-2.5">
                    <Link href={`/admin/users/${u.userId}`} className="text-accent hover:underline">
                      {u.email ?? u.userId}
                    </Link>
                    {u.fullName && <p className="text-xs text-text-muted">{u.fullName}</p>}
                  </td>
                  <td className="px-5 py-2.5 text-text-secondary">{formatDate(u.createdAt)}</td>
                  <td className="px-5 py-2.5">
                    {u.isSuspended ? (
                      <span className="rounded-full bg-error/10 px-2.5 py-1 text-xs font-medium text-error">Suspended</span>
                    ) : (
                      <span className="text-xs text-text-muted">Active</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    {u.isTester ? (
                      <span className="rounded-full bg-agent-light px-2.5 py-1 text-xs font-medium text-agent-dark">Tester</span>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-text-secondary">{u.customUsageMultiplier}x</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {data.totalCount} user{data.totalCount === 1 ? "" : "s"} total
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchPage(page - 1, search)}
            disabled={page <= 1 || isPending}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          <p className="text-xs text-text-muted">
            Page {page} of {totalPages}
          </p>
          <button
            type="button"
            onClick={() => fetchPage(page + 1, search)}
            disabled={page >= totalPages || isPending}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
