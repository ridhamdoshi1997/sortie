"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";

import { formatJobDescription } from "@/lib/jobDescriptionFormatter";

type Props = {
  /** AI-cleaned 2-4 sentence summary (lib/evaluator.ts) — strips job-board/
   * ATS boilerplate out of the raw posting. Null for jobs scraped before
   * this extraction pass, or ones that haven't re-evaluated since. */
  aboutRole: string | null;
  /** The raw scraped posting text (jobs.description) — always the complete
   * original, whether or not an AI summary also exists. */
  fullDescription: string | null;
  sourceUrl: string | null;
};

// Renders the real scraped text, structured — never AI content (the
// formatter is pure string parsing, zero model calls), so this deliberately
// does NOT get the app's agent-teal "AI-generated" treatment; that's
// reserved for actual model output.
function FormattedDescription({ text }: { text: string }) {
  const blocks = formatJobDescription(text);

  if (blocks.length === 0) {
    return <p className="whitespace-pre-line">{text}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <h4 key={i} className="mt-2 text-xs font-semibold uppercase tracking-wide text-text-muted first:mt-0">
              {block.text}
            </h4>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="flex flex-col gap-1.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2">
                  <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-text-muted" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function isTruncatedPreview(description: string | null): boolean {
  if (!description) return false;

  const trimmed = description.trim();
  return trimmed.endsWith("…") || trimmed.endsWith("...");
}

// Job-detail redesign, cont'd (2026-08-25 — professional-polish pass): this
// used to open its own `border shadow-card` box with an icon-chip header,
// stacked above four more identical boxes (Responsibilities/Qualification/
// Benefits/HiringProcess) — the exact "same-size cards as page structure"
// anti-pattern a design review flags as the lazy container. All five are
// now panes inside one shared card (see "The Role" section, app/find-jobs/
// [id]/page.tsx) with internal dividers instead of repeated borders. This
// pane leads without its own header — it's the first thing under "The
// Role"'s own SectionHeader, so a second "Job Description" label directly
// beneath it was pure restatement.
//
// Expand toggle added same pass, direct user report ("you are not putting
// the full jd by extracting everything?") — the lead paragraph is the AI's
// cleaned summary, not the full posting (a deliberate earlier fix for raw
// scraped blobs full of job-board boilerplate — see evaluator.ts's own
// comment on `aboutRole`). The complete original text was still fully
// stored in `jobs.description`, just never surfaced once a summary existed.
// User's explicit choice: keep the clean summary as the lead, add a
// "Show full description" toggle rather than always showing both or
// dropping the summary — least scrolling, full text still one click away.
export function JobDescription({ aboutRole, fullDescription, sourceUrl }: Props) {
  const [expanded, setExpanded] = useState(false);
  const primaryText = aboutRole || fullDescription;

  // Only worth a toggle when the summary and the raw text genuinely differ
  // — with no aboutRole, primaryText already IS the full text, so a second
  // "show full description" control would just repeat what's already shown.
  const trimmedFull = fullDescription?.trim() ?? "";
  const hasExpandableFull = Boolean(aboutRole) && trimmedFull.length > 0 && trimmedFull !== aboutRole?.trim();

  const shouldShowFullPostLink = isTruncatedPreview(primaryText) && sourceUrl && !hasExpandableFull;

  return (
    <div className="px-6 py-6">
      {hasExpandableFull ? (
        <p className="whitespace-pre-line text-[15px] font-medium leading-7 text-text-primary">{primaryText}</p>
      ) : (
        <div className="text-[15px] font-medium leading-7 text-text-primary">
          <FormattedDescription text={primaryText ?? "No job description is available for this role yet."} />
        </div>
      )}

      {hasExpandableFull && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent-dark"
          >
            {expanded ? "Hide full description" : "Show full description"}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {expanded && fullDescription && (
            <div className="animate-in fade-in-0 slide-in-from-top-1 mt-3 rounded-lg border border-border-light bg-surface-secondary p-4 text-sm leading-6 text-text-secondary duration-200">
              <FormattedDescription text={fullDescription} />
            </div>
          )}
        </>
      )}

      {shouldShowFullPostLink && (
        <div className="mt-6 rounded-lg border border-border bg-surface-secondary p-4">
          <p className="text-sm leading-6 text-text-secondary">
            This job board provided a preview that ends mid-sentence. Open the original listing to read the full description.
          </p>
          <Link
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary"
          >
            View Full Job Post
          </Link>
        </div>
      )}
    </div>
  );
}
