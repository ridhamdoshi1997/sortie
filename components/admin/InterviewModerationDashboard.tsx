"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Plus, Trash2, Undo2, X } from "lucide-react";

import {
  addAdminInterviewQuestion,
  deleteContributedQuestion,
  loadInterviewAdmin,
  moderateContributedQuestion,
} from "@/actions/adminInterview";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminRole } from "@/lib/admin/auth";
import type { ContributedQuestionRow, InterviewAdminData, ModerationStatus } from "@/lib/admin/interviewModeration";

// Moderation surface for contributed_interview_questions (Phase 52,
// section 4). The table shipped in Phase 51 with an explicit "no
// moderation" note; this is the review step it said to build "the moment
// this needs moderating."
//
// Submissions now default to `pending`, so nothing a stranger types reaches
// a public SEO page until someone approves it. The status filter defaults to
// Pending for that reason — the queue is the job, the archive is reference.

const STATUS_TABS: { value: ModerationStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function InterviewModerationDashboard({
  initialData,
  viewerRole,
}: {
  initialData: InterviewAdminData;
  viewerRole: AdminRole;
}) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<ModerationStatus>("pending");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<ContributedQuestionRow | null>(null);

  const canModerate = viewerRole === "owner" || viewerRole === "admin";

  const visible = useMemo(() => data.queue.filter((r) => r.status === tab), [data.queue, tab]);
  const volumeTotal = useMemo(() => data.volume.reduce((s, d) => s + d.count, 0), [data.volume]);
  const peakDay = useMemo(() => Math.max(1, ...data.volume.map((d) => d.count)), [data.volume]);

  function refresh(): void {
    startTransition(async () => {
      const result = await loadInterviewAdmin();
      if (result.success) setData(result.data);
    });
  }

  function moderate(id: string, status: ModerationStatus): void {
    setError(null);
    startTransition(async () => {
      const result = await moderateContributedQuestion(id, status);
      if (!result.success) {
        setError(result.error ?? "Could not update that submission.");
        return;
      }
      refresh();
    });
  }

  function remove(id: string): void {
    setError(null);
    startTransition(async () => {
      const result = await deleteContributedQuestion(id);
      if (!result.success) {
        setError(result.error ?? "Could not delete that submission.");
        return;
      }
      setConfirmTarget(null);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Awaiting review"
          value={String(data.counts.pending)}
          sub={data.counts.pending > 0 ? "public pages won't show these yet" : "queue is clear"}
          alert={data.counts.pending > 0}
        />
        <StatCard label="Published" value={String(data.counts.published)} sub="live on public company pages" />
        <StatCard
          label={`Submissions / ${data.windowDays}d`}
          value={String(volumeTotal)}
          sub="rejected excluded"
        />
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {canModerate && <AddQuestionForm onAdded={refresh} setError={setError} />}

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-text-primary">Contributed questions</h2>
          <div className="flex gap-1 rounded-lg bg-surface-secondary p-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  tab === t.value ? "bg-surface text-text-primary shadow-card" : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {t.label} ({data.counts[t.value]})
              </button>
            ))}
          </div>
        </div>

        {!canModerate && (
          <p className="mt-2 text-xs text-text-muted">
            Read-only for your role — approving or rejecting publishes to a public page, so it needs owner or admin.
          </p>
        )}

        {visible.length === 0 ? (
          <p className="mt-6 text-sm text-text-muted">
            {tab === "pending" ? "Nothing waiting for review." : `No ${tab} submissions.`}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {visible.map((r) => (
              <article key={r.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{r.company}</span>
                  <span className="text-text-muted">·</span>
                  <span className="text-sm text-text-secondary">{r.role}</span>
                  {r.source === "admin" && (
                    <span className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                      added by admin
                    </span>
                  )}
                </div>
                {/* Never agent-teal: ui-tokens.md reserves that treatment
                    EXCLUSIVELY for AI-generated content, and the entire
                    value of this table is that a human wrote it. */}
                <p className="mt-2 text-sm text-text-primary">{r.question}</p>
                <p className="mt-2 text-xs text-text-muted">
                  {r.submitterEmail ?? "unknown submitter"} · submitted {formatDate(r.createdAt)}
                  {r.interviewDate ? ` · interviewed ${formatDate(r.interviewDate)}` : ""}
                  {r.moderatedBy ? ` · ${r.status} by ${r.moderatedBy}` : ""}
                </p>

                {canModerate && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.status !== "published" && (
                      <button
                        type="button"
                        onClick={() => moderate(r.id, "published")}
                        disabled={isPending}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                    )}
                    {r.status !== "rejected" && (
                      <button
                        type="button"
                        onClick={() => moderate(r.id, "rejected")}
                        disabled={isPending}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    )}
                    {r.status !== "pending" && (
                      <button
                        type="button"
                        onClick={() => moderate(r.id, "pending")}
                        disabled={isPending}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Back to pending
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmTarget(r)}
                      disabled={isPending}
                      className="inline-flex h-8 items-center gap-1.5 px-2 text-xs font-medium text-error hover:underline disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h2 className="text-base font-semibold text-text-primary">Company coverage</h2>
        <p className="mt-1 text-xs text-text-muted">
          Which companies are carried by AI-generated banks versus real contributed questions. The hub&apos;s whole claim is
          that these are questions real candidates were actually asked, so a company sitting at zero contributed is a
          different product than one backed by real submissions.
        </p>
        {data.coverage.length === 0 ? (
          <p className="mt-6 text-sm text-text-muted">No companies with interview content yet.</p>
        ) : (
          <div className="mt-4 max-h-[50vh] overflow-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="sticky top-0 z-10 bg-surface-secondary">
                  {["Company", "AI-generated", "Contributed", "Pending"].map((h) => (
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
                {data.coverage.map((c) => (
                  <tr key={c.companyKey} className="border-t border-border">
                    <td className="px-5 py-2.5 text-text-primary">{c.company}</td>
                    <td className="px-5 py-2.5 font-mono text-text-secondary">{c.aiQuestionCount}</td>
                    <td className="px-5 py-2.5 font-mono text-text-primary">{c.contributedCount}</td>
                    <td className={`px-5 py-2.5 font-mono ${c.pendingCount > 0 ? "text-warning" : "text-text-muted"}`}>
                      {c.pendingCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h2 className="text-base font-semibold text-text-primary">Contribution volume</h2>
        <p className="mt-1 text-xs text-text-muted">Last {data.windowDays} days, rejected submissions excluded.</p>
        {volumeTotal === 0 ? (
          <p className="mt-6 text-sm text-text-muted">
            No contributions in this window. The contribute modal is live on the public Interview hub.
          </p>
        ) : (
          <div className="mt-4 flex h-24 items-end gap-0.5">
            {data.volume.map((d) => (
              <div
                key={d.date}
                title={`${d.date}: ${d.count}`}
                className="flex-1 rounded-sm bg-accent/70"
                style={{ height: `${Math.max(2, (d.count / peakDay) * 100)}%` }}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Delete this submission?"
        description="This permanently removes a real person's submission. Rejecting it hides it from public pages and is reversible — deleting is not."
        confirmLabel="Delete"
        pending={isPending}
        onConfirm={() => confirmTarget && remove(confirmTarget.id)}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}

function StatCard({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border p-6 shadow-card ${alert ? "border-warning/30 bg-warning/5" : "border-border bg-surface"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-3 font-mono text-3xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </div>
  );
}

function AddQuestionForm({ onAdded, setError }: { onAdded: () => void; setError: (e: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [question, setQuestion] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [isSubmitting, startTransition] = useTransition();

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addAdminInterviewQuestion({ company, role, question, interviewDate: interviewDate || null });
      if (!result.success) {
        setError(result.error ?? "Could not add that question.");
        return;
      }
      setCompany("");
      setRole("");
      setQuestion("");
      setInterviewDate("");
      setOpen(false);
      onAdded();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
      >
        <Plus className="h-4 w-4" />
        Add a question
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h2 className="text-base font-semibold text-text-primary">Add a question</h2>
      <p className="mt-1 text-xs text-text-muted">
        Publishes immediately and is tagged <span className="font-mono">added by admin</span> — an admin adding it is the
        review step, and the tag keeps it honest about not coming from a candidate.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
          required
          className="h-9 w-44 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role"
          required
          className="h-9 w-44 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
        />
        <input
          type="date"
          value={interviewDate}
          onChange={(e) => setInterviewDate(e.target.value)}
          className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
        />
      </div>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="The question, exactly as it was asked"
        required
        rows={3}
        className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-signal h-9 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
