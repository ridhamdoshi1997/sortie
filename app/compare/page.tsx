import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { EVALUATION_DIMENSIONS, type EvaluationDimensionResult, type EvaluationGrade } from "@/lib/evaluator";
import { decodeOffer, EMPTY_OFFER_DETAILS, type OfferDetails } from "@/lib/equityDecoder";

export const dynamic = "force-dynamic";

type CompareJob = {
  id: string;
  title: string | null;
  company: string | null;
  match_score: number | null;
  overall_grade: EvaluationGrade | null;
  salary: string | null;
  location: string | null;
  evaluation: EvaluationDimensionResult[] | null;
  offer_details: OfferDetails | null;
};

function formatMoney(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

// Same grade-color convention as EvaluationBreakdown.tsx (agent-teal for
// good grades, warning/error reserved for the two genuinely concerning
// ones) — small, deliberate duplication rather than restructuring that
// file's exports for one shared constant.
const GRADE_BADGE: Record<EvaluationGrade, string> = {
  A: "bg-agent text-agent-foreground",
  B: "bg-agent-light text-agent-dark",
  C: "bg-surface-secondary text-text-secondary",
  D: "bg-warning/10 text-warning",
  F: "bg-error text-error-foreground",
};

function GradePill({ grade }: { grade: EvaluationGrade | null }) {
  if (!grade) return <span className="text-xs text-text-muted">—</span>;
  return <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${GRADE_BADGE[grade]}`}>{grade}</span>;
}

// Job comparison view (build-plan.md §H) — reads job ids from `?ids=`,
// populated by AddToCompareButton.tsx's client-side compare tray. Scoped
// to real jobs owned by the signed-in user only.
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const user = await requireUser();
  const { ids } = await searchParams;
  const jobIds = (ids ?? "").split(",").filter(Boolean).slice(0, 3);

  const insforge = await createInsforgeServer();
  const { data } = jobIds.length
    ? await insforge.database
        .from("jobs")
        .select("id,title,company,match_score,overall_grade,salary,location,evaluation,offer_details")
        .eq("user_id", user.id)
        .in("id", jobIds)
    : { data: [] };

  // Preserve the order the user added them in, not whatever order the DB returns.
  const jobs = jobIds.map((id) => (data ?? []).find((j) => (j as CompareJob).id === id)).filter((j): j is CompareJob => Boolean(j));

  // Multi-offer comparison (build-plan.md §F) — only shown when at least one
  // job in this comparison has real offer numbers entered, reusing
  // lib/equityDecoder.ts's existing calculator rather than a new one. No AI,
  // no external data, same pure-arithmetic-on-user-input discipline as the
  // Offer Tools tab itself.
  const hasAnyOffer = jobs.some((job) => job.offer_details !== null);
  const offerResults = jobs.map((job) => decodeOffer(job.offer_details ?? EMPTY_OFFER_DETAILS));

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto w-full px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Compare Jobs</h1>
          <Link href="/find-jobs" className="text-sm text-accent hover:underline">
            Back to Jobs
          </Link>
        </div>

        {jobs.length < 2 ? (
          <p className="text-sm text-text-muted">
            Add 2-3 jobs to compare from their detail pages first — look for the &quot;Add to compare&quot; button.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="w-48 px-4 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Dimension
                  </th>
                  {jobs.map((job) => (
                    <th key={job.id} className="px-4 py-3 text-left">
                      <Link href={`/find-jobs/${job.id}`} className="font-semibold text-accent hover:underline">
                        {job.title ?? "Untitled role"}
                      </Link>
                      <p className="mt-0.5 font-normal text-text-muted">{job.company}</p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-text-secondary">Match score</td>
                  {jobs.map((job) => (
                    <td key={job.id} className="px-4 py-3 text-text-primary">
                      {job.match_score !== null ? `${job.match_score}%` : "—"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-text-secondary">Overall grade</td>
                  {jobs.map((job) => (
                    <td key={job.id} className="px-4 py-3">
                      <GradePill grade={job.overall_grade} />
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-text-secondary">Salary</td>
                  {jobs.map((job) => (
                    <td key={job.id} className="px-4 py-3 text-text-primary">
                      {job.salary || "Not disclosed"}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-medium text-text-secondary">Location</td>
                  {jobs.map((job) => (
                    <td key={job.id} className="px-4 py-3 text-accent">
                      {job.location || "—"}
                    </td>
                  ))}
                </tr>

                {hasAnyOffer && (
                  <>
                    <tr className="border-b border-border bg-surface-secondary">
                      <td colSpan={jobs.length + 1} className="px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                        Offer economics — your own entered numbers
                      </td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="px-4 py-3 font-medium text-text-secondary">Base salary</td>
                      {jobs.map((job) => (
                        <td key={job.id} className="px-4 py-3 text-text-primary">
                          {formatMoney(job.offer_details?.baseSalary ?? null)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-border">
                      <td className="px-4 py-3 font-medium text-text-secondary">Total comp — Year 1</td>
                      {jobs.map((job, i) => (
                        <td key={job.id} className="px-4 py-3 font-semibold text-text-primary">
                          {formatMoney(offerResults[i].totalComp.year1)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-border">
                      <td className="px-4 py-3 font-medium text-text-secondary">Total comp — Steady state</td>
                      {jobs.map((job, i) => (
                        <td key={job.id} className="px-4 py-3 font-semibold text-text-primary">
                          {formatMoney(offerResults[i].totalComp.steadyState)}
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {EVALUATION_DIMENSIONS.map((dimension) => (
                  <tr key={dimension} className="border-b border-border">
                    <td className="px-4 py-3 font-medium text-text-secondary">{dimension}</td>
                    {jobs.map((job) => {
                      const result = job.evaluation?.find((d) => d.dimension === dimension);
                      return (
                        <td key={job.id} className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <GradePill grade={result?.grade ?? null} />
                            <span className="text-xs leading-5 text-text-muted">{result?.note ?? "Not yet evaluated"}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
