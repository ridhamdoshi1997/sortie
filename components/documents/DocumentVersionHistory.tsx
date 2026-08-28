"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Clock, Eye, History, Loader2, RotateCcw, X } from "lucide-react";

import { listDocumentVersions, restoreDocumentVersion, type DocumentVersionRow } from "@/actions/documents";
import { formatTimeAgo } from "@/lib/utils";

// Version manager panel (direct user report — regenerating for a job used
// to silently destroy the previous AI draft, no way back). Lists archived
// document_versions rows for this job+kind (newest first — auto-created
// right before every regenerate/restore overwrites what's live, see
// lib/documentPersistence.ts's archiveCurrentDocument) with a real "View"
// (opens that exact archived PDF) and "Restore" (makes it current again —
// archives whatever it's replacing too, so restoring never loses data
// either) per row.
export function DocumentVersionHistory({
  jobId,
  kind,
  label,
}: {
  jobId: string;
  kind: "resume" | "cover_letter";
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<DocumentVersionRow[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Deferred via setTimeout(0) — same idiom used elsewhere in this
    // codebase (e.g. KanbanCard.tsx's stageAgeLabel) to avoid the
    // react-hooks/set-state-in-effect cascading-render warning for a
    // setState that's fundamentally "load data when this opens."
    const timer = setTimeout(() => {
      setLoading(true);
      listDocumentVersions(jobId, kind)
        .then(setVersions)
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [open, jobId, kind]);

  function handleRestore(versionId: string): void {
    setError(null);
    setRestoringId(versionId);
    startTransition(async () => {
      const result = await restoreDocumentVersion(versionId);
      setRestoringId(null);
      if (result.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? "Failed to restore this version");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface"
      >
        <History className="h-4 w-4" />
        History
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
            <div
              className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="text-sm font-semibold text-text-primary">{label} history</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {loading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading versions…
                  </div>
                ) : !versions || versions.length === 0 ? (
                  <p className="py-6 text-sm text-text-muted">
                    No past versions yet — they show up here once you regenerate this {kind === "resume" ? "résumé" : "cover letter"} for the first time.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {versions.map((version) => (
                      <li
                        key={version.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-secondary/50 px-3.5 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-2 text-sm text-text-primary">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                          <span>{formatTimeAgo(version.created_at)}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <a
                            href={`/api/documents/download-version?versionId=${version.id}`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="View this version"
                            title="View this version"
                            className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRestore(version.id)}
                            disabled={isPending}
                            aria-label="Restore this version"
                            title="Restore this version"
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {restoringId === version.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Restore
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {error && <p className="mt-3 text-sm text-error">{error}</p>}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
