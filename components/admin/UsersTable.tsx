"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { getUsersPage } from "@/actions/admin";
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

  const totalPages = Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE));

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
    });
  }

  function handleSearchSubmit(e: React.FormEvent): void {
    e.preventDefault();
    fetchPage(1, search);
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
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Search
        </button>
      </form>

      {error && <p className="mb-2 text-xs text-error">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-surface-secondary">
              {["User", "Joined", "Status", "Usage multiplier"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-sm text-text-muted">
                  No users match this search.
                </td>
              </tr>
            ) : (
              data.rows.map((u) => (
                <tr key={u.userId} className="border-t border-border">
                  <td className="px-5 py-4">
                    <Link href={`/admin/users/${u.userId}`} className="text-accent hover:underline">
                      {u.email ?? u.userId}
                    </Link>
                    {u.fullName && <p className="text-xs text-text-muted">{u.fullName}</p>}
                  </td>
                  <td className="px-5 py-4 text-text-secondary">{formatDate(u.createdAt)}</td>
                  <td className="px-5 py-4">
                    {u.isSuspended ? (
                      <span className="rounded-full bg-error/10 px-2.5 py-1 text-xs font-medium text-error">Suspended</span>
                    ) : (
                      <span className="text-xs text-text-muted">Active</span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono text-text-secondary">{u.customUsageMultiplier}x</td>
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
