"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download } from "lucide-react";

import { saveCoverLetterContent, saveResumeStyle } from "@/actions/documents";
import { CoverLetterATSAuditCard } from "@/components/documents/CoverLetterATSAuditCard";
import { DocumentChatEditor } from "@/components/documents/DocumentChatEditor";
import { DocumentVersionHistory } from "@/components/documents/DocumentVersionHistory";
import { EditorUsageMeter } from "@/components/documents/EditorUsageMeter";
import { RefinementChips, type ChipPreset } from "@/components/documents/RefinementChips";
import { StyleTab } from "@/components/documents/StyleTab";
import { FormInput, FormLabel } from "@/components/ui/FormControls";
import type { Profile } from "@/types";
import type { ResumeStyle } from "@/types/resumeEditor";

// Same next/dynamic(ssr:false) pattern as ResumeWorkspace's ResumeLivePreview
// — PDFViewer needs browser-only internals.
const CoverLetterLivePreview = dynamic(
  () => import("@/components/documents/CoverLetterLivePreview").then((m) => m.CoverLetterLivePreview),
  { ssr: false, loading: () => <PreviewSkeleton /> },
);

function PreviewSkeleton() {
  return (
    <div className="flex h-[700px] items-center justify-center rounded-lg border border-border bg-surface text-sm text-text-muted">
      Loading preview…
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Tone/length presets researched via agy — cover-letter-specific, distinct
// from the résumé's own DEFAULT_PRESETS in RefinementChips.tsx (bullet
// wording tweaks don't apply here; letters need tone/hook/closing controls
// instead).
const COVER_LETTER_PRESETS: ChipPreset[] = [
  { label: "Make it more concise", prompt: "Make this cover letter more concise — 2-3 short, punchy paragraphs instead of a long traditional letter." },
  { label: "Warmer and more enthusiastic", prompt: "Make the tone warmer and more enthusiastic while staying professional — this should not read as generic or stiff." },
  { label: "Strengthen the opening line", prompt: "Rewrite only the opening line into a stronger, more specific hook — not a generic 'I am writing to apply for...' opener." },
  { label: "More proactive closing", prompt: "Rewrite only the closing paragraph to be more proactive — a clear next step, not a passive 'I look forward to hearing from you.'" },
];

type Props = {
  jobId: string;
  profile: Profile;
  company: string | null;
  initialLetterBody: string;
  initialSalutation: string | null;
  initialStyle: ResumeStyle;
  initialUpdatedAt: string | null;
};

export function CoverLetterWorkspace({
  jobId,
  profile,
  company,
  initialLetterBody,
  initialSalutation,
  initialStyle,
  initialUpdatedAt,
}: Props) {
  const [letterBody, setLetterBody] = useState(initialLetterBody);
  const [salutation, setSalutation] = useState(initialSalutation ?? "");
  const [style, setStyle] = useState(initialStyle);
  const [tab, setTab] = useState<"editor" | "style">("editor");
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [savingContent, setSavingContent] = useState(false);
  const [savingStyle, setSavingStyle] = useState(false);
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-expanding body textarea (agy's research: a letter is fluid prose,
  // not a fixed-height field) — plain DOM style mutation, not a setState
  // call, so this doesn't trip react-hooks/set-state-in-effect.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [letterBody]);

  const commitContent = useCallback(
    (nextBody: string, nextSalutation: string) => {
      setLetterBody(nextBody);
      setSalutation(nextSalutation);
      if (contentTimer.current) clearTimeout(contentTimer.current);
      contentTimer.current = setTimeout(async () => {
        setSavingContent(true);
        const result = await saveCoverLetterContent(jobId, { letterBody: nextBody, salutation: nextSalutation.trim() || null });
        setSavingContent(false);
        if (result.success) setUpdatedAt(new Date().toISOString());
      }, 900);
    },
    [jobId],
  );

  // Reuses the exact same applications.resume_style row (and its own save
  // action) the résumé workspace already writes to — see CoverLetterPDF.tsx
  // and saveResumeStyle's own comment for why the two documents share one
  // style rather than each having an independent choice.
  const commitStyle = useCallback(
    (next: ResumeStyle) => {
      setStyle(next);
      if (styleTimer.current) clearTimeout(styleTimer.current);
      styleTimer.current = setTimeout(async () => {
        setSavingStyle(true);
        const result = await saveResumeStyle(jobId, next);
        setSavingStyle(false);
        if (result.success) setUpdatedAt(new Date().toISOString());
      }, 500);
    },
    [jobId],
  );

  // AI chat/chip revisions only ever touch the letter body, never the
  // salutation — see useDocumentChat's RevisedData comment.
  function handleRevised(data: { letterBody?: string }) {
    if (data.letterBody) setLetterBody(data.letterBody);
    setUpdatedAt(new Date().toISOString());
  }

  return (
    <div className="fade-in-up overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Cover letter workspace</h3>
          <p className="font-mono text-[11px] text-text-muted">
            {savingContent || savingStyle ? "Saving…" : `Updated ${formatRelative(updatedAt)}`}
          </p>
        </div>
        <EditorUsageMeter action="document_generation" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="border-b border-border bg-surface-secondary p-6 lg:border-b-0 lg:border-r">
          <CoverLetterLivePreview
            profile={profile}
            company={company}
            letterBody={letterBody}
            style={style}
            salutation={salutation.trim() || null}
          />
        </div>

        <div className="flex flex-col">
          {/* Underline, not a filled pill — same fix as ResumeWorkspace.tsx's
             own tab switcher (2026-08-26). */}
          <div className="flex gap-1 border-b border-border p-3">
            {(
              [
                { key: "editor", label: "Editor" },
                { key: "style", label: "Style" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex-1 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  tab === key
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-muted hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Keyed on `tab` — see ResumeWorkspace.tsx's own comment. */}
          <div key={tab} className="animate-in fade-in-0 slide-in-from-bottom-1 max-h-[560px] overflow-y-auto p-5 duration-200">
            {tab === "editor" && (
              <div className="flex flex-col gap-4">
                {/* Static UI copy, not AI output — a neutral bordered hint,
                   not the flat agent-light wash it used to be (2026-08-26). */}
                <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-secondary p-3.5">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-agent" />
                  <p className="text-xs leading-6 text-text-secondary">
                    <strong className="text-text-primary">This cover letter shares its look with the tailored résumé for this job.</strong> Change the
                    template, theme, or colors in the Style tab and both documents update together.
                  </p>
                </div>

                <CoverLetterATSAuditCard style={style} letterBody={letterBody} salutation={salutation} company={company} />

                <div>
                  <FormLabel>Salutation</FormLabel>
                  <FormInput
                    value={salutation}
                    onChange={(v) => commitContent(letterBody, v)}
                    placeholder={`Hiring Team${company ? `, ${company}` : ""}`}
                  />
                </div>

                <div>
                  <FormLabel>Letter body</FormLabel>
                  <textarea
                    ref={bodyRef}
                    value={letterBody}
                    onChange={(e) => commitContent(e.target.value, salutation)}
                    rows={10}
                    placeholder="Dear Hiring Team,&#10;&#10;I'm writing to apply for..."
                    className="w-full resize-none overflow-hidden rounded-lg border border-border bg-surface p-3 text-xs leading-6 text-text-primary outline-none placeholder:text-text-muted/60 focus-visible:border-accent"
                  />
                  <p className="mt-1 text-[11px] text-text-muted">Leave a blank line between paragraphs.</p>
                </div>

                <RefinementChips jobId={jobId} kind="cover_letter" presets={COVER_LETTER_PRESETS} onRevised={handleRevised} />
                <DocumentChatEditor jobId={jobId} kind="cover_letter" onRevised={handleRevised} />
              </div>
            )}
            {tab === "style" && <StyleTab style={style} onChange={commitStyle} documentType="cover_letter" />}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border bg-surface-secondary p-5">
        <a
          href={`/api/documents/download?jobId=${jobId}&kind=cover_letter`}
          target="_blank"
          rel="noreferrer"
          className="btn-signal inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-accent-foreground"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </a>
        <DocumentVersionHistory jobId={jobId} kind="cover_letter" label="Cover letter" />
      </div>
    </div>
  );
}
