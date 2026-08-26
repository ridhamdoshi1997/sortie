"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";

import type { AdminRole } from "@/lib/admin/auth";
import type { PageListRow } from "@/lib/admin/content";
import { generateGeoPageNow } from "@/actions/adminContent";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ContentList({ pages, viewerRole }: { pages: PageListRow[]; viewerRole: AdminRole }) {
  const canWrite = viewerRole === "owner" || viewerRole === "admin";
  const [isGenerating, startGenerating] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  function handleGenerateGeo(): void {
    setNotice(null);
    startGenerating(async () => {
      const result = await generateGeoPageNow();
      setNotice(
        result.success
          ? "Queued — a new GEO draft page will appear here in a few moments (refresh to check)."
          : result.error,
      );
    });
  }

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Pages</h2>
          {notice && <p className="mt-1 text-xs text-text-muted">{notice}</p>}
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateGeo}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 rounded-md border border-agent/30 bg-agent-light px-3 py-1.5 text-xs font-medium text-agent-dark transition-opacity hover:opacity-90 disabled:opacity-50"
              title="Draft a new data-backed job-market page from real aggregate job data — same pipeline as the weekly cron"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isGenerating ? "Queuing…" : "Generate GEO page now"}
            </button>
            <Link
              href="/admin/content/new"
              className="btn-signal inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-accent-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              New page
            </Link>
          </div>
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
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/content/${p.id}`} className="text-accent hover:underline">
                        {p.title}
                      </Link>
                      {p.contentSource === "ai_geo" && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-agent-light px-2 py-0.5 text-[10px] font-medium text-agent-dark"
                          title="Drafted by the programmatic SEO/GEO content engine from real aggregate job data"
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          AI GEO
                        </span>
                      )}
                    </div>
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
