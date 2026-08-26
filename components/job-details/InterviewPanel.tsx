"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, Sparkles, Trash2, Users } from "lucide-react";

import {
  addInterviewPanelMember,
  removeInterviewPanelMember,
  researchPanelMember,
  type InterviewPanelMemberRow,
} from "@/actions/interviewPanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

type Props = {
  jobId: string;
  company: string;
  members: InterviewPanelMemberRow[];
};

// Gated to show only once the candidate is actually interviewing (see the
// applicationStatus === "interviewing" check at this component's call
// site) — same idiom DocumentGenerator.tsx already uses for its
// draft-only stale-listing warning. Names come from the candidate
// themselves; nothing here is discovered automatically.
export function InterviewPanel({ jobId, company, members }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InterviewPanelMemberRow | null>(null);
  const [researchingId, setResearchingId] = useState<string | null>(null);
  // Collapsed by default — this card sits in a narrower sidebar column
  // alongside Trap Door Predictor now (Interview Prep Room tab), where an
  // always-expanded background block per panelist gets visually heavy fast.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(): void {
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addInterviewPanelMember(jobId, name.trim(), title.trim());
      if (!result.success) {
        setError(result.error ?? "Failed to add this panelist.");
        return;
      }
      setName("");
      setTitle("");
      setAdding(false);
      router.refresh();
    });
  }

  function handleResearch(memberId: string): void {
    setResearchingId(memberId);
    startTransition(async () => {
      const result = await researchPanelMember(memberId, company);
      setResearchingId(null);
      if (!result.success) {
        setError(result.error ?? "Could not research this panelist.");
        return;
      }
      router.refresh();
    });
  }

  function handleConfirmDelete(): void {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      await removeInterviewPanelMember(id);
      setDeleteTarget(null);
      router.refresh();
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-text-secondary" />
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
            Interview Panel
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          <Plus className="h-4 w-4" />
          Add panelist
        </button>
      </div>

      {adding && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-secondary p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="h-10 min-w-40 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="h-10 min-w-40 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={handleAdd}
            className="btn-signal h-10 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            Add
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {members.length === 0 && !adding ? (
        <p className="mt-3 text-sm text-text-muted">
          Add who you&apos;re meeting once you know — a quick background lookup helps you walk in
          prepared.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {members.map((member, i) => (
            <div
              key={member.id}
              className="dim-card-in rounded-xl border border-border bg-surface-secondary p-4 transition-colors hover:border-agent/25"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-text-primary">{member.name}</p>
                  {member.title && <p className="text-xs text-text-muted">{member.title}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={researchingId === member.id}
                    onClick={() => handleResearch(member.id)}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {researchingId === member.id
                      ? "Researching..."
                      : member.researched_background
                        ? "Refresh"
                        : "Research background"}
                  </button>
                  {member.researched_background && (
                    <button
                      type="button"
                      onClick={() => setExpandedId((id) => (id === member.id ? null : member.id))}
                      aria-label={expandedId === member.id ? "Hide background" : "Show background"}
                      className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
                    >
                      {expandedId === member.id ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(member)}
                    aria-label="Remove"
                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {researchingId === member.id && (
                <AiThinkingCard className="mt-3" status={`Researching ${member.name}'s background…`} />
              )}

              {member.researched_background && expandedId === member.id && (
                <AiReadsCard className="animate-in fade-in-0 slide-in-from-top-1 mt-3 duration-200">
                  <p className="text-sm text-text-primary">{member.researched_background.summary}</p>
                  {member.researched_background.priorCompanies.length > 0 && (
                    <p className="mt-2 text-xs text-text-primary">
                      Prior: {member.researched_background.priorCompanies.join(", ")}
                    </p>
                  )}
                  {member.researched_background.interviewPrepNote && (
                    <p className="mt-2 text-sm font-medium text-text-primary">
                      {member.researched_background.interviewPrepNote}
                    </p>
                  )}
                </AiReadsCard>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Remove this panelist?"
        description={deleteTarget ? `${deleteTarget.name} will be removed from this job's panel.` : ""}
        pending={isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
