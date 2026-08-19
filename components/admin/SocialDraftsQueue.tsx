"use client";

import { useState, useTransition } from "react";
import { Check, Sparkles, ThumbsDown, X } from "lucide-react";

import type { SocialDraftRow, SocialDraftStatus } from "@/lib/admin/socialDrafts";
import { setSocialDraftStatus } from "@/actions/adminSocialDrafts";

const STATUS_LABEL: Record<SocialDraftStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  posted: "Posted",
};

const STATUS_CLASS: Record<SocialDraftStatus, string> = {
  pending_review: "bg-surface-secondary text-text-secondary",
  approved: "bg-agent-light text-agent-dark",
  rejected: "bg-error/10 text-error",
  posted: "bg-accent-muted text-accent",
};

function DraftCard({ draft, canWrite }: { draft: SocialDraftRow; canWrite: boolean }) {
  const [status, setStatus] = useState(draft.status);
  const [isPending, startTransition] = useTransition();

  function updateStatus(next: SocialDraftStatus): void {
    startTransition(async () => {
      const result = await setSocialDraftStatus(draft.id, next);
      if (result.success) setStatus(next);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-primary">{draft.headline}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
      </div>
      <p className="whitespace-pre-line text-sm leading-6 text-text-secondary">{draft.threadMarkdown}</p>
      {canWrite && status === "pending_review" && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => updateStatus("approved")}
            className="inline-flex items-center gap-1.5 rounded-md bg-agent px-3 py-1.5 text-xs font-medium text-agent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Approve
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => updateStatus("rejected")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface disabled:opacity-50"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            Reject
          </button>
        </div>
      )}
      {canWrite && status === "approved" && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => updateStatus("posted")}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Mark posted
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => updateStatus("rejected")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

export function SocialDraftsQueue({ drafts, canWrite }: { drafts: SocialDraftRow[]; canWrite: boolean }) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-agent" />
        <h2 className="text-base font-semibold text-text-primary">Success story drafts</h2>
      </div>
      <p className="mt-1 text-sm text-text-secondary">
        AI-drafted, anonymized social posts generated automatically when a user logs a real offer. Review before ever posting anywhere.
      </p>

      {drafts.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No drafts yet — one queues automatically the next time a user marks a job &quot;Offered.&quot;</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} canWrite={canWrite} />
          ))}
        </div>
      )}
    </div>
  );
}
