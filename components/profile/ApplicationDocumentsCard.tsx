"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Download, ExternalLink, FileText, Loader2, Mail, Plus, Trash2 } from "lucide-react";

import { deleteTailoredResume } from "@/actions/resumes";
import { deleteTailoredCoverLetter } from "@/actions/documents";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type ApplicationStatus = "draft" | "applied" | "interviewing" | "offered" | "rejected";

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offer",
  rejected: "Rejected",
};

// Same token pairing pattern used everywhere else in this app for status-ish
// badges (bg-X-light / text-X-foreground) — agent-teal for "interviewing"
// since that's the active/in-motion state, not because it's AI content.
const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  draft: "bg-surface-secondary text-text-muted",
  applied: "bg-info-light text-info-foreground",
  interviewing: "bg-agent-light text-agent-dark",
  offered: "bg-success-lightest text-success-foreground",
  rejected: "bg-error/10 text-error",
};

type Props = {
  jobId: string;
  title: string;
  company: string;
  companyLogoUrl: string | null;
  applicationStatus: ApplicationStatus;
  hasCoverLetter: boolean;
};

// Redesigned from a résumé-only row into a per-JOB "application package"
// card — researched via agy: a job seeker's mental model here is "my
// materials for Job X," not a flat pile of PDFs. The header links to the
// job itself (not straight into an editor); the "document tray" below shows
// both documents as their own slots — a solid pill when generated, a
// dashed "ghost slot" invite when not, so a missing cover letter reads as
// an action to take rather than a broken/incomplete state.
export function ApplicationDocumentsCard({
  jobId,
  title,
  company,
  companyLogoUrl,
  applicationStatus,
  hasCoverLetter,
}: Props) {
  const router = useRouter();
  const [deletingResume, setDeletingResume] = useState(false);
  const [deletingCoverLetter, setDeletingCoverLetter] = useState(false);
  // Which delete is pending confirmation, if any — drives the shared
  // ConfirmDialog below instead of the browser's own window.confirm().
  const [confirmTarget, setConfirmTarget] = useState<"resume" | "cover_letter" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function requestDelete(e: React.MouseEvent, target: "resume" | "cover_letter") {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    setConfirmTarget(target);
  }

  async function handleConfirmDelete() {
    if (confirmTarget === "resume") {
      setDeletingResume(true);
      const result = await deleteTailoredResume(jobId);
      setDeletingResume(false);
      setConfirmTarget(null);
      if (!result.success) {
        setDeleteError(result.error ?? "Failed to delete this tailored résumé.");
        return;
      }
      router.refresh();
    } else if (confirmTarget === "cover_letter") {
      setDeletingCoverLetter(true);
      const result = await deleteTailoredCoverLetter(jobId);
      setDeletingCoverLetter(false);
      setConfirmTarget(null);
      if (!result.success) {
        setDeleteError(result.error ?? "Failed to delete this cover letter.");
        return;
      }
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-secondary">
      <Link href={`/find-jobs/${jobId}`} className="flex items-center gap-3">
        <CompanyLogo company={company} logoUrl={companyLogoUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{title}</p>
          <p className="truncate text-xs text-text-muted">{company}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASSES[applicationStatus]}`}
        >
          {STATUS_LABELS[applicationStatus]}
        </span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      </Link>

      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
        {/* Outer div, not a Link — the download <a>/delete <button> are
            siblings of the label Link, not nested inside it (a Link inside
            a Link is invalid HTML and breaks click targeting). Label is
            styled and marked (ChevronRight) as a real navigation link, not
            plain text, so it reads as clickable at a glance. */}
        <div className="group flex flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2 transition-colors hover:border-agent">
          <Link
            href={`/resume/tailored/${jobId}`}
            className="flex flex-1 items-center gap-2 text-xs font-medium text-agent transition-colors group-hover:underline"
          >
            <FileText className="h-3.5 w-3.5" />
            Résumé
            <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          <span className="flex items-center gap-1">
            <a
              href={`/api/documents/download?jobId=${jobId}&kind=resume`}
              target="_blank"
              rel="noreferrer"
              aria-label="Download tailored résumé"
              className="rounded-md p-1 text-text-muted hover:bg-surface hover:text-text-primary"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={(e) => requestDelete(e, "resume")}
              disabled={deletingResume}
              aria-label="Delete tailored résumé"
              className="rounded-md p-1 text-text-muted hover:bg-error/10 hover:text-error disabled:opacity-50"
            >
              {deletingResume ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </span>
        </div>

        {hasCoverLetter ? (
          <div className="group flex flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2 transition-colors hover:border-agent">
            <Link
              href={`/cover-letter/tailored/${jobId}`}
              className="flex flex-1 items-center gap-2 text-xs font-medium text-agent transition-colors group-hover:underline"
            >
              <Mail className="h-3.5 w-3.5" />
              Cover letter
              <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            <span className="flex items-center gap-1">
              <a
                href={`/api/documents/download?jobId=${jobId}&kind=cover_letter`}
                target="_blank"
                rel="noreferrer"
                aria-label="Download cover letter"
                className="rounded-md p-1 text-text-muted hover:bg-surface hover:text-text-primary"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={(e) => requestDelete(e, "cover_letter")}
                disabled={deletingCoverLetter}
                aria-label="Delete cover letter"
                className="rounded-md p-1 text-text-muted hover:bg-error/10 hover:text-error disabled:opacity-50"
              >
                {deletingCoverLetter ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </span>
          </div>
        ) : (
          // Deep-links into the job-details page's own "Generate" flow
          // (DocumentGenerator.tsx reads this `?generate=` param and fires
          // it automatically) rather than just landing the user there and
          // making them find the button themselves.
          <Link
            href={`/find-jobs/${jobId}?generate=cover_letter`}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Add cover letter
          </Link>
        )}
      </div>

      {deleteError && <p className="text-xs text-error">{deleteError}</p>}

      <ConfirmDialog
        open={confirmTarget !== null}
        title={confirmTarget === "resume" ? "Delete tailored résumé?" : "Delete cover letter?"}
        description={`This removes the ${confirmTarget === "resume" ? "tailored résumé" : "cover letter"} for "${title}". This can't be undone.`}
        pending={deletingResume || deletingCoverLetter}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
