"use client";

import { useEffect, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";

import { ResumePDF } from "@/components/documents/ResumePDF";
import type { Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type Props = {
  profile: Profile;
  sections: ResumeSection[];
  style: ResumeStyle;
};

// PDFViewer regenerates the whole PDF blob on every prop change — debounced
// so rapid typing/slider-dragging in the editor doesn't thrash it. This
// renders the SAME ResumePDF component the real download uses, so the
// preview is genuinely WYSIWYG rather than a separate HTML approximation
// that has to be kept pixel-matched by hand.
export function ResumeLivePreview({ profile, sections, style }: Props) {
  const [debounced, setDebounced] = useState({ sections, style });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ sections, style }), 400);
    return () => clearTimeout(timer);
  }, [sections, style]);

  // Fills its container rather than declaring its own 700px. The workspace
  // puts this beside a scrolling editor panel, and a hard height here made
  // the two columns independently sized — whichever was taller left a blank
  // patch next to the shorter one. Both user-reported, one on each side.
  return (
    <div className="h-full min-h-[420px]">
      <PDFViewer width="100%" height="100%" showToolbar>
        <ResumePDF profile={profile} sections={debounced.sections} style={debounced.style} />
      </PDFViewer>
    </div>
  );
}
