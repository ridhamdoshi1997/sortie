"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { assertUuid, runAdminSql } from "@/lib/insforge-admin-sql";
import { createAdminClient } from "@insforge/sdk";

type ActionResult = { success: boolean; error?: string };

function adminClient() {
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}

// Full account erasure — GDPR/CCPA "right to erasure". Deletes every row and
// storage object that carries this user's data, then the auth.users row
// itself. Irreversible; there is no undo.
//
// The four row-deletes run as ONE call, semicolon-separated, deliberately
// WITHOUT explicit BEGIN/COMMIT — the rawsql endpoint rejects those with
// "Transaction control statements are not allowed" (confirmed live). This
// isn't a gap: Postgres's simple-query protocol already wraps a
// multi-statement string with no explicit BEGIN/COMMIT in an implicit
// transaction on its own. Verified live, twice, against a real disposable
// test account created via signUp() + the admin API: (1) the full sequence
// actually deletes every row including every cascade, and (2) a deliberately
// broken statement appended after a valid DELETE caused the valid DELETE to
// roll back too — nothing partial survives a failure. A partial failure
// across separate calls would leave a genuinely half-deleted account (e.g.
// app data gone but still able to log in), which is worse than the delete
// not happening at all — this is why it's one call, not four. Statement
// order inside it matters:
//   - agent_runs before profiles — agent_runs.user_id -> profiles has no
//     ON DELETE action (confirmed live via pg_constraint), so it would
//     block the profiles delete otherwise. agent_logs cascades from both
//     agent_runs and profiles, so it's covered either way.
//   - jobs has no FK to profiles or auth.users at all (confirmed live), so
//     nothing cascades this; must be explicit.
//   - auth.users last — cascades auth.user_providers, applications,
//     usage_daily, and rate_limit automatically (all confirmed ON DELETE
//     CASCADE from auth.users live via pg_constraint). See
//     lib/insforge-admin-sql.ts for why this goes through raw SQL rather
//     than the SDK (no delete-user endpoint exists yet).
//
// Storage objects are a separate system (not part of the SQL transaction) —
// deleted first, best-effort, from data read before anything is destroyed.
export async function deleteAccount(): Promise<ActionResult> {
  const user = await requireUser();
  assertUuid(user.id, "user.id");

  try {
    const insforge = await createInsforgeServer();
    const admin = adminClient();

    // Read storage paths while the rows that reference them still exist.
    const { data: applicationDocsRaw } = await insforge.database
      .from("applications")
      .select("resume_pdf_url, cover_letter_pdf_url")
      .eq("user_id", user.id);
    const applicationDocs = (applicationDocsRaw ?? []) as Array<{
      resume_pdf_url: string | null;
      cover_letter_pdf_url: string | null;
    }>;

    const { data: profileRow } = await insforge.database
      .from("profiles")
      .select("resume_pdf_url")
      .eq("id", user.id)
      .maybeSingle<{ resume_pdf_url: string | null }>();

    const storagePaths = [
      profileRow?.resume_pdf_url,
      ...applicationDocs.flatMap((doc) => [doc.resume_pdf_url, doc.cover_letter_pdf_url]),
    ].filter((path): path is string => Boolean(path));

    // Best-effort: a missing/already-gone file must never block deletion —
    // the row it belonged to is about to be deleted regardless.
    for (const path of storagePaths) {
      await admin.storage
        .from("resumes")
        .remove(path)
        .catch((error) => {
          console.error("[actions/account] storage remove failed, continuing", path, error);
        });
    }

    // One implicit transaction for every row-delete, including the auth
    // record — either all of it happens or none of it does (see comment
    // above; verified live, not assumed).
    await runAdminSql(
      `DELETE FROM agent_runs WHERE user_id = '${user.id}';
       DELETE FROM jobs WHERE user_id = '${user.id}';
       DELETE FROM profiles WHERE id = '${user.id}';
       DELETE FROM auth.users WHERE id = '${user.id}';`,
    );

    return { success: true };
  } catch (error) {
    console.error("[actions/account] deleteAccount failed", error);
    return {
      success: false,
      error:
        "Something went wrong deleting your account. Your data has not been changed — please try again or contact support.",
    };
  }
}
