import type { createInsforgeServer } from "@/lib/insforge-server";

type Insforge = Awaited<ReturnType<typeof createInsforgeServer>>;
type DocumentKind = "resume" | "cover_letter";

type PersistInput = {
  insforge: Insforge;
  userId: string;
  jobId: string;
  kind: DocumentKind;
  pdfBuffer: Buffer;
  contentText: string;
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
}: PersistInput): Promise<PersistResult> {
  const storagePath = `${userId}/${jobId}/${kind === "resume" ? "resume" : "cover-letter"}.pdf`;

  // SDK has no upsert — remove then upload, matching resume/generate/route.tsx.
  await insforge.storage.from("resumes").remove(storagePath);
  const blob = new Blob([pdfBuffer as unknown as ArrayBuffer], {
    type: "application/pdf",
  });
  const { error: uploadError } = await insforge.storage
    .from("resumes")
    .upload(storagePath, blob);

  if (uploadError) {
    console.error("[documentPersistence] storage upload", uploadError);
    return { success: false, error: "Failed to upload document" };
  }

  const documentColumn = kind === "resume" ? "generated_resume" : "generated_cover_letter";
  const urlColumn = kind === "resume" ? "resume_pdf_url" : "cover_letter_pdf_url";

  const { data: existingApplication } = await insforge.database
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle<{ id: string }>();

  const applicationPatch = {
    [documentColumn]: contentText,
    [urlColumn]: storagePath,
    ai_model_used: "gemini-3.1-flash-lite",
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
