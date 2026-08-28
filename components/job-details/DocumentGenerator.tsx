"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ComponentType } from "react";
import { AlertTriangle, Download, Eye, FileText, Mail, SquarePen, Sparkles, X } from "lucide-react";

import { DocumentChatEditor } from "@/components/documents/DocumentChatEditor";
import { DocumentVersionHistory } from "@/components/documents/DocumentVersionHistory";
import { GenerationProgress } from "@/components/ui/GenerationProgress";
import { getListingSignal } from "@/lib/jobStatus";
import { ThemeSelector } from "@/components/shared/ThemeSelector";
import type { ResumeTheme } from "@/components/documents/ResumePDF";

const GENERATION_STAGES: Record<DocumentKind, string[]> = {
  resume: [
    "Reading this job's requirements and your profile…",
    "Rewriting your experience for this role…",
    "Laying out the final PDF…",
  ],
  cover_letter: [
    "Reading this job's requirements and your profile…",
    "Drafting your cover letter…",
    "Laying out the final PDF…",
  ],
};

type DocumentKind = "resume" | "cover_letter";

type Props = {
  jobId: string;
  resumePdfUrl: string | null;
  coverLetterPdfUrl: string | null;
  applicationStatus?: string;
  markedUnavailableAt?: string | null;
  droppedFromSearchAt?: string | null;
  foundAt?: string | null;
  themeValue: ResumeTheme;
};

type ActionProps = {
  jobId: string;
  kind: DocumentKind;
  label: string;
  hasDocument: boolean;
  icon: ComponentType<{ className?: string }>;
  // /resume/tailored/[jobId] or /cover-letter/tailored/[jobId] — the real
  // live-preview editor workspace, distinct from the raw-PDF "View" link
  // below (which just opens the last-persisted file).
  workspaceHref: string;
  index?: number;
};

function DocumentAction({ jobId, kind, label, hasDocument, icon: Icon, workspaceHref, index = 0 }: ActionProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);

  function handleGenerate(): void {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/documents/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, kind }),
        });
        const json = (await res.json()) as { success: boolean; error?: string };

        if (!res.ok || !json.success) {
          setError(json.error ?? "Generation failed. Please try again.");
          return;
        }

        router.refresh();
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  // Deep-link support: ApplicationDocumentsCard's "+ Add cover letter"
  // ghost slot links here with `?generate=cover_letter` so the user lands
  // already generating, instead of landing on the page and having to find
  // the button themselves. Deferred via setTimeout(0) — same reason as
  // every other mount-effect setState in this project
  // (react-hooks/set-state-in-effect flags a direct synchronous call).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("generate") !== kind || hasDocument) return;
    const timer = setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      handleGenerate();
      params.delete("generate");
      const query = params.toString();
      router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
    }, 0);
    return () => clearTimeout(timer);
    // Mount-only: reacting to `kind`/`hasDocument` changes here would
    // re-fire generation on every unrelated re-render once the param is
    // already stripped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="dim-card-in flex flex-1 flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-4 transition-colors hover:border-agent/25"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Plain heading, not a link — a "click the title" affordance turned
          out to be undiscoverable even with hover styling (user-caught
          live, twice). Edit/View below are explicit, always-visibly-styled
          links instead — exactly Edit-goes-to-editor / View-opens-the-pdf,
          no implicit click targets. */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-muted text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold leading-5 text-text-primary">{label}</h3>
      </div>

      {/* Primary (solid accent) + secondary (outline) button hierarchy —
          researched via agy: plain text links next to a solid button read
          as unfinished; outline buttons give secondary actions real
          visual weight without competing with the primary one. Left-to-
          right reading order matches this row's existing left-aligned
          flow (primary already sat first before this change). */}
      {isPending ? (
        <GenerationProgress
          title={label}
          stages={GENERATION_STAGES[kind]}
          timeEstimate="Usually takes 10–20 seconds"
        />
      ) : (
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={isPending}
          onClick={handleGenerate}
          className="btn-signal inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {hasDocument ? "Regenerate" : "Generate"}
        </button>
        {hasDocument && (
          <>
            <Link
              href={workspaceHref}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface"
            >
              <SquarePen className="h-4 w-4" />
              Edit
            </Link>
            <a
              href={`/api/documents/download?jobId=${jobId}&kind=${kind}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface"
            >
              <Eye className="h-4 w-4" />
              View
            </a>
            {kind === "resume" && (
              <a
                href={`/api/documents/download-docx?jobId=${jobId}`}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface"
              >
                <Download className="h-4 w-4" />
                DOCX
              </a>
            )}
            <DocumentVersionHistory jobId={jobId} kind={kind} label={label} />
          </>
        )}
      </div>
      )}

      {error && <p className="text-xs text-error">{error}</p>}

      {hasDocument && <DocumentChatEditor jobId={jobId} kind={kind} />}
    </div>
  );
}

export function DocumentGenerator({
  jobId,
  resumePdfUrl,
  coverLetterPdfUrl,
  applicationStatus,
  markedUnavailableAt,
  droppedFromSearchAt,
  foundAt,
  themeValue,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const signal = getListingSignal({
    marked_unavailable_at: markedUnavailableAt ?? null,
    dropped_from_search_at: droppedFromSearchAt ?? null,
    found_at: foundAt ?? null,
  });
  // Only worth a cost-protection warning before the user has committed to
  // this job — once applied (or further), the documents already exist for
  // real reasons and generating/regenerating shouldn't be second-guessed
  // (researched via agy: never disrupt the experience for an applied job).
  // "inbox"/"shortlisted" both mean pre-application (Inbox/Pipeline split).
  const showWarning = signal && (applicationStatus === "inbox" || applicationStatus === "shortlisted") && !dismissed;

  return (
    <section className="border border-border bg-surface shadow-card overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
            <Sparkles className="h-4 w-4 text-accent" />
          </div>
          <h2 className="text-base font-semibold leading-6 text-text-primary">
            Application Documents
          </h2>
        </div>
        {/* Moved here from ResumeFitSection.tsx (2026-08-25, direct user
            report: "irrelevant there") — this is where a theme choice
            actually applies, to the resume/cover-letter PDFs generated
            below. Applies to both, per ThemeSelector.tsx's own comment. */}
        <ThemeSelector value={themeValue} />
      </div>

      {showWarning && (
        // Neutral surface + colored chip, not a full bg-warning/10 wash
        // (professional-polish pass, 2026-08-25) — same recipe as
        // ApplyVerdictBadge/MatchScore's FlagRow.
        <div className="mx-6 mt-6 flex items-start gap-3 rounded-xl border border-warning/25 bg-surface px-4 py-3 text-sm">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
          <p className="flex-1 pt-0.5 leading-5 text-text-secondary">
            <strong className="text-warning">{signal!.label}.</strong> This posting may no longer be accepting
            applications — you can still generate documents if you want to apply anyway.
          </p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 rounded-md p-0.5 text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 p-6 sm:flex-row">
        <DocumentAction
          jobId={jobId}
          kind="resume"
          label="Tailored Resume"
          hasDocument={!!resumePdfUrl}
          icon={FileText}
          workspaceHref={`/resume/tailored/${jobId}`}
          index={0}
        />
        <DocumentAction
          jobId={jobId}
          kind="cover_letter"
          label="Cover Letter"
          hasDocument={!!coverLetterPdfUrl}
          icon={Mail}
          workspaceHref={`/cover-letter/tailored/${jobId}`}
          index={1}
        />
      </div>
    </section>
  );
}
