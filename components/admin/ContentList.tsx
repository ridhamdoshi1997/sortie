"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import type { AdminRole } from "@/lib/admin/auth";
import type { PageListRow } from "@/lib/admin/content";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ContentList({ pages, viewerRole }: { pages: PageListRow[]; viewerRole: AdminRole }) {
  const canWrite = viewerRole === "owner" || viewerRole === "admin";

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Pages</h2>
        {canWrite && (
          <Link
            href="/admin/content/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New page
          </Link>
        )}
      </div>

      {pages.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No pages yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="bg-surface-secondary">
                {["Title", "Slug", "Status", "Published", "Updated"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-5 py-4">
                    <Link href={`/admin/content/${p.id}`} className="text-accent hover:underline">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-mono text-text-secondary">/{p.slug}</td>
                  <td className="px-5 py-4">
                    {p.status === "published" ? (
                      <span className="rounded-full bg-agent-light px-2.5 py-1 text-xs font-medium text-agent-dark">Published</span>
                    ) : (
                      <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">Draft</span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono text-text-secondary">{formatDate(p.publishedAt)}</td>
                  <td className="px-5 py-4 font-mono text-text-secondary">{formatDate(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
