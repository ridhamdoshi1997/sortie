"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Paperclip, Plus } from "lucide-react";

import { getAdminTicketsList } from "@/actions/adminSupport";
import type { AdminTicketRow } from "@/lib/admin/support";
import type { AdminRole } from "@/lib/admin/auth";
import type { TicketCategory, TicketStatus } from "@/actions/support";

const STATUS_LABELS: Record<TicketStatus, string> = { open: "Open", pending: "Pending", resolved: "Resolved" };
const STATUS_CHIP_CLASS: Record<TicketStatus, string> = {
  open: "bg-warning/10 text-warning",
  pending: "bg-info-light text-info",
  resolved: "bg-agent-light text-agent-dark",
};
const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: "Bug",
  feature_request: "Feature",
  change_request: "Change",
  feedback: "Feedback",
  billing: "Billing",
  other: "Other",
  support: "Support",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SupportInbox({ initialTickets, viewerRole }: { initialTickets: AdminTicketRow[]; viewerRole: AdminRole }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "all">("all");
  const [isPending, startTransition] = useTransition();
  const canWrite = viewerRole === "owner" || viewerRole === "admin";

  function applyFilter(next: TicketStatus | "all"): void {
    setFilter(next);
    startTransition(async () => {
      const result = await getAdminTicketsList(next, categoryFilter);
      if (result.success) setTickets(result.tickets);
    });
  }

  function applyCategoryFilter(next: TicketCategory | "all"): void {
    setCategoryFilter(next);
    startTransition(async () => {
      const result = await getAdminTicketsList(filter, next);
      if (result.success) setTickets(result.tickets);
    });
  }

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && (
          <Link
            href="/admin/support/new"
            className="btn-signal mr-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-accent-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New ticket
          </Link>
        )}
        {(["all", "open", "pending", "resolved"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => applyFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === s ? "bg-accent text-accent-foreground" : "bg-surface-secondary text-text-secondary hover:bg-border/40"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
          </button>
        ))}
        {isPending && <span className="text-xs text-text-muted">Loading…</span>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">Category</span>
        {(["all", "bug", "feature_request", "change_request", "feedback", "billing", "other", "support"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => applyCategoryFilter(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryFilter === c ? "bg-accent text-accent-foreground" : "bg-surface-secondary text-text-secondary hover:bg-border/40"
            }`}
          >
            {c === "all" ? "All" : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {tickets.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No tickets{filter !== "all" ? ` with status "${STATUS_LABELS[filter]}"` : ""}.</p>
      ) : (
        // Operate-mode density (Phase 26, admin-redesign Phase 2, agy
        // research) — py-4 rows read fine on a handful of tickets but waste
        // real screen space once the queue has dozens; py-2.5 fits ~40%
        // more rows without feeling cramped (still a real 44px+ tap target).
        // Sticky header (`sticky top-0 z-10`, solid bg so rows don't show
        // through while scrolling) and a row hover state are the other two
        // agy-cited operator patterns — a hover-highlighted row is the
        // groundwork for real per-row quick-actions later, not decoration.
        <div className="mt-4 max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-surface-secondary">
                {["Subject", "Category", "From", "Status", "Assigned", "Updated"].map((h) => (
                  <th key={h} className="px-5 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-t border-border transition-colors hover:bg-surface-secondary/60">
                  <td className="px-5 py-2.5">
                    <Link href={`/admin/support/${t.id}`} className="text-accent hover:underline">
                      {t.subject}
                    </Link>
                    {t.imageCount > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-text-muted">
                        <Paperclip className="h-3 w-3" />
                        {t.imageCount}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">{CATEGORY_LABELS[t.category]}</span>
                  </td>
                  <td className="px-5 py-2.5 text-text-secondary">{t.userEmail ?? "—"}</td>
                  <td className="px-5 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CHIP_CLASS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                  </td>
                  <td className="px-5 py-2.5 text-text-secondary">{t.assignedAdminEmail ?? "Unassigned"}</td>
                  <td className="px-5 py-2.5 font-mono text-text-secondary">{formatDate(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
