"use client";

import { useEffect, useState } from "react";
import { PDFViewer, pdf } from "@react-pdf/renderer";

import { ResumePDF } from "@/components/documents/ResumePDF";
import type { Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type Props = {
  profile: Profile;
  sections: ResumeSection[];
  style: ResumeStyle;
};

// Pages in a rendered PDF. react-pdf writes page objects uncompressed, so each
// page is one "/Type /Page" entry ("/Pages" is the page tree, excluded).
function countPages(pdfText: string): number {
  return (pdfText.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

// PDFViewer regenerates the whole PDF blob on every prop change — debounced
// so rapid typing/slider-dragging in the editor doesn't thrash it. This
// renders the SAME ResumePDF component the real download uses, so the
// preview is genuinely WYSIWYG rather than a separate HTML approximation
// that has to be kept pixel-matched by hand.
export function ResumeLivePreview({ profile, sections, style }: Props) {
  const [debounced, setDebounced] = useState({ sections, style });
  const [pages, setPages] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ sections, style }), 400);
    return () => clearTimeout(timer);
  }, [sections, style]);

  // Page count (Phase 1). "Make it one page" was guesswork: the viewer shows
  // pages but never says when content has spilled onto a second one. Counted
  // from the same document the viewer renders, a moment after it settles.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const blob = await pdf(<ResumePDF profile={profile} sections={debounced.sections} style={debounced.style} />).toBlob();
        const count = countPages(await blob.text());
        if (!cancelled) setPages(count > 0 ? count : null);
      } catch {
        if (!cancelled) setPages(null);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profile, debounced]);

  // Fills its container rather than declaring its own 700px. The workspace
  // puts this beside a scrolling editor panel, and a hard height here made
  // the two columns independently sized — whichever was taller left a blank
  // patch next to the shorter one. Both user-reported, one on each side.
  return (
    <div className="relative h-full min-h-[420px]">
      <PDFViewer width="100%" height="100%" showToolbar>
        <ResumePDF profile={profile} sections={debounced.sections} style={debounced.style} />
      </PDFViewer>
      {pages !== null && (
        <div
          role="status"
          className={`pointer-events-none absolute bottom-3 left-3 rounded-full border bg-surface px-2.5 py-1 font-mono text-[11px] shadow-card ${
            pages > 1 ? "border-warning/40 text-warning" : "border-border text-text-secondary"
          }`}
        >
          {pages === 1 ? "1 page" : `${pages} pages · runs past page 1`}
        </div>
      )}
    </div>
  );
}
