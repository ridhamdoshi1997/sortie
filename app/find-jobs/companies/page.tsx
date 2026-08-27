import { requireUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { TargetCompaniesManager } from "@/components/find-jobs/TargetCompaniesManager";
import { getTargetCompanies } from "@/lib/actions/scraper.actions";

// Phase 8 "Portal Scanner" (build-plan.md §24) — company-watchlist page,
// linked from /find-jobs. Direct ATS API scanning; see
// TargetCompaniesManager.tsx / lib/atsProviders.ts for the real mechanism.
export default async function TargetCompaniesPage() {
  const user = await requireUser();
  const companies = await getTargetCompanies(user.id);

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
          Jobs · Company Watchlist
        </p>
        <TargetCompaniesManager userId={user.id} companies={companies} />
      </main>
    </>
  );
}
