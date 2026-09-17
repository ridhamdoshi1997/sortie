import { requireUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { GlobalSearchView } from "@/components/search/GlobalSearchView";

// Global full-text search (build-plan.md §H) — a dedicated results page,
// distinct from Cmd+K's inline 6-result jump-to dropdown. Reachable from
// the Jobs nav dropdown (Navbar.tsx) and from Cmd+K's own "Search all jobs
// for…" footer link once a query is typed there.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireUser();
  const { q } = await searchParams;

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full flex-col gap-6 p-8">
        <p className="fade-in-up font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
          Search your job history
        </p>
        <GlobalSearchView initialQuery={q ?? ""} />
      </main>
    </>
  );
}
