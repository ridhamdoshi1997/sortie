"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { getAdminTicketsList } from "@/actions/adminSupport";
import type { AdminTicketRow } from "@/lib/admin/support";
import type { AdminRole } from "@/lib/admin/auth";
import type { TicketStatus } from "@/actions/support";

const STATUS_LABELS: Record<TicketStatus, string> = { open: "Open", pending: "Pending", resolved: "Resolved" };
const STATUS_CHIP_CLASS: Record<TicketStatus, string> = {
  open: "bg-warning/10 text-warning",
  pending: "bg-info-light text-info",
  resolved: "bg-agent-light text-agent-dark",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SupportInbox({ initialTickets, viewerRole }: { initialTickets: AdminTicketRow[]; viewerRole: AdminRole }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const [isPending, startTransition] = useTransition();
  const canWrite = viewerRole === "owner" || viewerRole === "admin";

  function applyFilter(next: TicketStatus | "all"): void {
    setFilter(next);
    startTransition(async () => {
      const result = await getAdminTicketsList(next);
      if (result.success) setTickets(result.tickets);
    });
  }

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center gap-2">
        {canWrite && (
          <Link
            href="/admin/support/new"
            className="mr-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
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

      {tickets.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No tickets{filter !== "all" ? ` with status "${STATUS_LABELS[filter]}"` : ""}.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-surface-secondary">
                {["Subject", "From", "Status", "Assigned", "Updated"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-5 py-4">
                    <Link href={`/admin/support/${t.id}`} className="text-accent hover:underline">
                      {t.subject}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-text-secondary">{t.userEmail ?? "—"}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CHIP_CLASS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                  </td>
                  <td className="px-5 py-4 text-text-secondary">{t.assignedAdminEmail ?? "Unassigned"}</td>
                  <td className="px-5 py-4 font-mono text-text-secondary">{formatDate(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
