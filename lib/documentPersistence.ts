import type { createInsforgeServer } from "@/lib/insforge-server";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type Insforge = Awaited<ReturnType<typeof createInsforgeServer>>;
type DocumentKind = "resume" | "cover_letter";

export type ExistingApplicationRow = {
  id: string;
  generated_resume: string | null;
  generated_cover_letter: string | null;
  resume_pdf_url: string | null;
  cover_letter_pdf_url: string | null;
  resume_sections: ResumeSection[] | null;
  resume_style: ResumeStyle | null;
  ai_model_used: string | null;
};

// Résumé/cover-letter version manager (direct user report: regenerating for
// the same job silently destroyed the previous AI draft — same fixed
// storage path, same applications row, overwritten every time with no way
// back). Archives whatever is CURRENTLY live for this job/kind into
// document_versions — its own permanent copy of the PDF plus a content
// snapshot — right before it gets overwritten. Called from both a fresh
// generate (persistGeneratedDocument below) and a restore (restoreDocumentVersion,
// actions/documents.ts), so "restoring an old version" also archives
// whatever it's replacing rather than losing it. No-op on a job's first-ever
// generate for a kind (nothing live yet to archive).
export async function archiveCurrentDocument(
  insforge: Insforge,
  existing: ExistingApplicationRow | null,
  kind: DocumentKind,
  userId: string,
  jobId: string,
): Promise<void> {
  if (!existing) return;

  const currentUrl = kind === "resume" ? existing.resume_pdf_url : existing.cover_letter_pdf_url;
  if (!currentUrl) return;

  const { data: currentBlob, error: downloadError } = await insforge.storage
    .from("resumes")
    .download(currentUrl);
  if (downloadError || !currentBlob) {
    // The live file may already be gone (e.g. a previous archive attempt
    // partially failed) — don't block the new generation/restore over a
    // history-preservation step that has nothing left to preserve.
    console.error("[documentPersistence] archive download", downloadError);
    return;
  }

  const archivePath = `${userId}/${jobId}/${kind}/versions/${Date.now()}.pdf`;
  const { error: archiveUploadError } = await insforge.storage
    .from("resumes")
    .upload(archivePath, currentBlob);
  if (archiveUploadError) {
    console.error("[documentPersistence] archive upload", archiveUploadError);
    return;
  }

  const contentText = kind === "resume" ? existing.generated_resume : existing.generated_cover_letter;

  const { error: versionInsertError } = await insforge.database.from("document_versions").insert([
    {
      user_id: userId,
      job_id: jobId,
      kind,
      storage_path: archivePath,
      content_text: contentText,
      resume_sections: kind === "resume" ? existing.resume_sections : null,
      resume_style: kind === "resume" ? existing.resume_style : null,
      model_used: existing.ai_model_used,
    },
  ]);
  if (versionInsertError) {
    console.error("[documentPersistence] archive version insert", versionInsertError);
  }
}

/**
 * Uploads with three attempts and a short backoff, returning the final error
 * or null on success.
 *
 * Only network-shaped failures are worth retrying — an ECONNRESET or a
 * `fetch failed` is a transient socket problem, whereas a 4xx (bad policy,
 * payload too large, duplicate) will fail identically every time and
 * retrying it just makes the user wait three times as long for the same
 * answer. The Supabase storage client surfaces transient cases with no
 * `statusCode` at all, which is what distinguishes them here.
 */
async function uploadWithRetry(
  insforge: Insforge,
  storagePath: string,
  blob: Blob,
): Promise<{ message: string } | null> {
  const MAX_ATTEMPTS = 3;
  let lastError: { message: string } | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { error } = await insforge.storage.from("resumes").upload(storagePath, blob);
    if (!error) return null;

    lastError = error;
    const statusCode = (error as { statusCode?: string | number }).statusCode;
    const isTransient = statusCode === undefined || statusCode === null || Number(statusCode) >= 500;
    if (!isTransient || attempt === MAX_ATTEMPTS) return error;

    console.warn(`[documentPersistence] upload attempt ${attempt} failed (${error.message}) — retrying`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    // A partial object can survive a reset and then collide with the retry,
    // since this bucket has no upsert. Clear it first.
    await insforge.storage.from("resumes").remove([storagePath]);
  }

  return lastError;
}

type PersistInput = {
  insforge: Insforge;
  userId: string;
  jobId: string;
  kind: DocumentKind;
  pdfBuffer: Buffer;
  contentText: string;
  modelUsed: string;
};

type PersistResult =
  | { success: true; storagePath: string }
  | { success: false; error: string };

export async function persistGeneratedDocument({
  insforge,
  userId,
  jobId,
  kind,
  pdfBuffer,
  contentText,
  modelUsed,
}: PersistInput): Promise<PersistResult> {
  const storagePath = `${userId}/${jobId}/${kind === "resume" ? "resume" : "cover-letter"}.pdf`;

  const { data: existingApplication } = await insforge.database
    .from("applications")
    .select(
      "id,generated_resume,generated_cover_letter,resume_pdf_url,cover_letter_pdf_url,resume_sections,resume_style,ai_model_used",
    )
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle<ExistingApplicationRow>();

  await archiveCurrentDocument(insforge, existingApplication ?? null, kind, userId, jobId);

  // SDK has no upsert — remove then upload, matching resume/generate/route.tsx.
  await insforge.storage.from("resumes").remove([storagePath]);
  const blob = new Blob([pdfBuffer as unknown as ArrayBuffer], {
    type: "application/pdf",
  });

  // Retried, because by the time we get here the expensive work is ALREADY
  // DONE — the AI call has been paid for and the revised résumé exists in
  // memory. Throwing all of that away over one flaky socket is the worst
  // possible trade.
  //
  // This is a real, observed failure, not a hypothetical: a user reported
  // the Action Plan chips doing nothing, and the server log showed
  // `StorageUnknownError: fetch failed / read ECONNRESET` on this exact
  // upload. Uploading a multi-page PDF over a single unretried request to a
  // remote storage host will occasionally reset, and the old code turned
  // that blip into a lost revision plus a dead-end error message.
  const uploadError = await uploadWithRetry(insforge, storagePath, blob);

  if (uploadError) {
    console.error("[documentPersistence] storage upload failed after retries", uploadError);
    return {
      success: false,
      error: "Couldn't save the PDF — the storage upload failed after three tries. Your text wasn't lost; try again in a moment.",
    };
  }

  const documentColumn = kind === "resume" ? "generated_resume" : "generated_cover_letter";
  const urlColumn = kind === "resume" ? "resume_pdf_url" : "cover_letter_pdf_url";

  const applicationPatch = {
    [documentColumn]: contentText,
    [urlColumn]: storagePath,
    ai_model_used: modelUsed,
    status: "generated",
  };

  const { error: applicationError } = existingApplication
    ? await insforge.database
        .from("applications")
        .update(applicationPatch)
        .eq("id", existingApplication.id)
    : await insforge.database.from("applications").insert([
        {
          user_id: userId,
          job_id: jobId,
          ...applicationPatch,
        },
      ]);

  if (applicationError) {
    console.error("[documentPersistence] save application", applicationError);
    return { success: false, error: "Failed to save generated document" };
  }

  return { success: true, storagePath };
}
