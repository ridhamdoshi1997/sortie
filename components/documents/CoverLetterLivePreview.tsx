"use client";

import { useEffect, useState } from "react";
import { PDFViewer } from "@react-pdf/renderer";

import { CoverLetterPDF } from "@/components/documents/CoverLetterPDF";
import type { Profile } from "@/types";
import type { ResumeStyle } from "@/types/resumeEditor";

type Props = {
  profile: Profile;
  company: string | null;
  letterBody: string;
  style: ResumeStyle;
  salutation: string | null;
};

// Same debounced-WYSIWYG pattern as ResumeLivePreview.tsx — renders the
// exact CoverLetterPDF component the real download uses.
export function CoverLetterLivePreview({ profile, company, letterBody, style, salutation }: Props) {
  const [debounced, setDebounced] = useState({ letterBody, style, salutation });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ letterBody, style, salutation }), 400);
    return () => clearTimeout(timer);
  }, [letterBody, style, salutation]);

  return (
    <PDFViewer width="100%" height={700} showToolbar>
      <CoverLetterPDF
        profile={profile}
        company={company}
        letterBody={debounced.letterBody}
        style={debounced.style}
        salutation={debounced.salutation}
      />
    </PDFViewer>
  );
}
