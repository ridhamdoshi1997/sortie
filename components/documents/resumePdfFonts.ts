import { Font } from "@react-pdf/renderer";

import { RESUME_FONTS } from "@/lib/resumeFonts";

let registered = false;

// Where react-pdf reads a font file from. In the browser (the live preview)
// that is the public URL. On the server (PDF downloads) it is the file itself:
// react-pdf opens a non-URL src from disk, and next.config.ts's
// outputFileTracingIncludes ships public/fonts with every route that renders a
// PDF — a server fetch of its own public URL would hit preview-deployment
// protection instead.
function fontSrc(file: string): string {
  return typeof window === "undefined" ? `${process.cwd()}/public/fonts/${file}` : `/fonts/${file}`;
}

/** Registers the embedded résumé fonts with react-pdf once per runtime. */
export function registerResumeFonts(): void {
  if (registered) return;
  registered = true;

  for (const spec of Object.values(RESUME_FONTS)) {
    if (spec.pdf.builtIn) continue;
    const prefix = spec.pdf.filePrefix;
    Font.register({
      family: spec.pdf.family,
      fonts: [
        { src: fontSrc(`${prefix}-latin-400-normal.woff`), fontWeight: 400, fontStyle: "normal" },
        { src: fontSrc(`${prefix}-latin-700-normal.woff`), fontWeight: 700, fontStyle: "normal" },
        { src: fontSrc(`${prefix}-latin-400-italic.woff`), fontWeight: 400, fontStyle: "italic" },
        { src: fontSrc(`${prefix}-latin-700-italic.woff`), fontWeight: 700, fontStyle: "italic" },
      ],
    });
  }
}
