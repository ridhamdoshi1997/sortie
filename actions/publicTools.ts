"use server";

// Same require-from-lib workaround as actions/profile.ts's extraction path
// — pdf-parse's index.js debug mode reads a test file on every require()
// and crashes under Next.js/Turbopack (module.parent is always null there).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  buf: Buffer,
) => Promise<{ text: string }>;

// PDF text extraction for the free ATS checker (build-plan.md §I) — the
// existing uploadResume()/extractProfileFromBuffer() in actions/profile.ts
// are both gated behind requireUser(), so this is a genuinely separate,
// deliberately public version doing only the local pdf-parse step (a pure
// CPU operation, no external API call, no new cost exposure). The file is
// never stored — extracted text is returned to populate the same textarea
// the paste flow already uses, so the user can see and edit what was
// extracted before submitting to the rate-limited /api/tools/ats-check
// route, exactly like the paste path already works.
export type ExtractResumeTextResult =
  | { success: true; text: string }
  | { success: false; error: string };

export async function extractResumeTextFromPdf(formData: FormData): Promise<ExtractResumeTextResult> {
  const file = formData.get("resume");
  if (!(file instanceof File)) {
    return { success: false, error: "No file provided." };
  }
  if (file.type !== "application/pdf") {
    return { success: false, error: "File must be a PDF." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { success: false, error: "File must be under 2MB." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text.trim();

    if (text.length < 50) {
      return { success: false, error: "Couldn't read text from that PDF — try pasting the text directly instead." };
    }

    return { success: true, text };
  } catch (error) {
    console.error("[actions/publicTools] extractResumeTextFromPdf", error);
    return { success: false, error: "Couldn't read that PDF — try pasting the text directly instead." };
  }
}
