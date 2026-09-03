import { assertUuid, runAdminSql } from "@/lib/insforge-admin-sql";
import { createAdminClient } from "@/lib/admin/client";

function adminClient() {
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}

// Full account erasure, extracted from actions/account.ts's deleteAccount()
// (Phase 26 — an admin-triggered delete needed the exact same sequence, not
// a second hand-rolled copy that could drift from the real, twice-live-
// verified one). See that file's git history for the original derivation
// notes: statement order matters (agent_runs/jobs/resumes have no FK-cascade
// from auth.users and must be deleted explicitly, before profiles/auth.users
// which do cascade the rest), one implicit transaction so nothing partial
// survives a failure, storage removal is best-effort and happens first
// while the rows that reference it still exist.
//
// Reads go through the SERVICE-ROLE client, not a cookie-authenticated one —
// the caller for actions/account.ts's self-service path is always deleting
// their own rows (which a regular RLS-scoped client can already read), but
// the admin-triggered path (actions/admin.ts's deleteUserAsAdmin) is reading
// a DIFFERENT user's rows, which a regular client scoped to the admin's own
// auth.uid() cannot see. Using the service-role client for both keeps this
// one function correct for either caller instead of needing two versions.
export async function deleteAllUserData(targetUserId: string): Promise<void> {
  assertUuid(targetUserId, "targetUserId");
  const admin = adminClient();

  const { data: applicationDocsRaw } = await admin.database
    .from("applications")
    .select("resume_pdf_url, cover_letter_pdf_url")
    .eq("user_id", targetUserId);
  const applicationDocs = (applicationDocsRaw ?? []) as Array<{
    resume_pdf_url: string | null;
    cover_letter_pdf_url: string | null;
  }>;

  const { data: profileRow } = await admin.database
    .from("profiles")
    .select("resume_pdf_url")
    .eq("id", targetUserId)
    .maybeSingle<{ resume_pdf_url: string | null }>();

  const { data: resumeRowsRaw } = await admin.database.from("resumes").select("storage_path").eq("user_id", targetUserId);
  const resumeRows = (resumeRowsRaw ?? []) as Array<{ storage_path: string | null }>;

  const storagePaths = [
    profileRow?.resume_pdf_url,
    ...applicationDocs.flatMap((doc) => [doc.resume_pdf_url, doc.cover_letter_pdf_url]),
    ...resumeRows.map((r) => r.storage_path),
  ].filter((path): path is string => Boolean(path));

  for (const path of storagePaths) {
    await admin.storage
      .from("resumes")
      .remove([path])
      .catch((error) => {
        console.error("[lib/accountDeletion] storage remove failed, continuing", path, error);
      });
  }

  await runAdminSql(
    `DELETE FROM agent_runs WHERE user_id = '${targetUserId}';
     DELETE FROM jobs WHERE user_id = '${targetUserId}';
     DELETE FROM resumes WHERE user_id = '${targetUserId}';
     DELETE FROM profiles WHERE id = '${targetUserId}';
     DELETE FROM auth.users WHERE id = '${targetUserId}';`,
  );
}
