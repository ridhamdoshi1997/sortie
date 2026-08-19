"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import type { BroadcastRow, BroadcastStatus } from "@/lib/admin/marketing";
import type { AdminRole } from "@/lib/admin/auth";

const STATUS_LABELS: Record<BroadcastStatus, string> = { draft: "Draft", sending: "Sending", sent: "Sent", failed: "Failed" };
const STATUS_CHIP_CLASS: Record<BroadcastStatus, string> = {
  draft: "bg-surface-secondary text-text-secondary",
  sending: "bg-info-light text-info",
  sent: "bg-agent-light text-agent-dark",
  failed: "bg-error/10 text-error",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function MarketingList({ broadcasts, eligibleCount, viewerRole }: { broadcasts: BroadcastRow[]; eligibleCount: number; viewerRole: AdminRole }) {
  const canWrite = viewerRole === "owner" || viewerRole === "admin";

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Eligible recipients</p>
        <p className="mt-3 font-mono text-3xl font-semibold text-text-primary">{eligibleCount}</p>
        <p className="mt-1 text-xs text-text-muted">Real profiles with an email, not opted out.</p>
      </div>

      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Broadcasts</h2>
          {canWrite && (
            <Link
              href="/admin/marketing/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              New broadcast
            </Link>
          )}
        </div>

        {broadcasts.length === 0 ? (
          <p className="mt-6 text-sm text-text-muted">No broadcasts yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-surface-secondary">
                  {["Subject", "Status", "Sent / Recipients", "Created"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-5 py-4">
                      <Link href={`/admin/marketing/${b.id}`} className="text-accent hover:underline">
                        {b.subject}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CHIP_CLASS[b.status]}`}>{STATUS_LABELS[b.status]}</span>
                    </td>
                    <td className="px-5 py-4 font-mono text-text-secondary">
                      {b.status === "sent" || b.status === "sending" ? `${b.sentCount} / ${b.recipientCount ?? "—"}` : "—"}
                    </td>
                    <td className="px-5 py-4 font-mono text-text-secondary">{formatDate(b.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
