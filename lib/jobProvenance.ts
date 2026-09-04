import { createAdminDbClient } from "@/lib/admin/client";

// Reads a canonical job's provenance rows for the job-detail page.
//
// job_sources is deliberately service-role-only: RLS is on with ZERO client
// policies (see the add-job-canonicalization migration's own comment — the
// table is written and read exclusively by lib/jobCanonicalization.ts's
// admin client). A normal cookie-authenticated session client therefore
// reads back an empty array here, silently and with no error, which is
// exactly the kind of quiet nothing that hides a broken feature.
//
// Using the service client on a normal consumer page view is the same
// narrowly-justified pattern lib/hiringSignal.ts already documents. The
// safety condition is that the caller cannot widen the scope: BOTH user_id
// and canonical_job_id are pinned below, user_id from the authenticated
// session rather than from any request input, so this can only ever return
// provenance for a job the caller already owns.
export type JobSourceRow = {
  source_type: string;
  discovered_at: string | null;
  raw_payload: { applicantCount?: string; experienceLevel?: string } | null;
};

export type JobProvenanceData = {
  sources: JobSourceRow[];
  applicantCount: string | null;
  experienceLevel: string | null;
};

export async function getJobProvenance(jobId: string, userId: string): Promise<JobProvenanceData> {
  const admin = createAdminDbClient();
  const { data, error } = await admin.database
    .from("job_sources")
    .select("source_type,discovered_at,raw_payload")
    .eq("canonical_job_id", jobId)
    .eq("user_id", userId)
    .order("discovered_at", { ascending: true });

  if (error) {
    // Provenance is additive context, never the reason a job page fails to
    // render — log and degrade to nothing rather than throwing.
    console.error("[lib/jobProvenance] job_sources read failed", error);
    return { sources: [], applicantCount: null, experienceLevel: null };
  }

  const sources = (data ?? []) as JobSourceRow[];
  return {
    sources,
    // First non-empty wins: only the LinkedIn (Apify) scrape carries these,
    // so at most one row in a multi-source listing will actually have them.
    applicantCount: sources.map((row) => row.raw_payload?.applicantCount).find(Boolean) ?? null,
    experienceLevel: sources.map((row) => row.raw_payload?.experienceLevel).find(Boolean) ?? null,
  };
}
