import { Navbar } from "@/components/layout/Navbar";

// Skeleton loader (build-plan.md §H) — Career Record is a long vertical
// stack of self-contained card sections (Outcome Insights, STAR Vault,
// Brag Doc, Skill Gaps, the timeline, etc.); a header block + a few
// stacked card-shaped placeholders reads honestly without hand-matching
// every one of those sections individually. Same pattern as the existing
// app/find-jobs/loading.tsx.
export default function CareerLoading() {
  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-2">
          <div className="h-9 w-56 animate-pulse rounded-md bg-surface-secondary" />
          <div className="h-5 w-80 animate-pulse rounded-md bg-surface-secondary" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-surface p-6" />
        ))}
      </main>
    </>
  );
}
