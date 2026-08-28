import { Navbar } from "@/components/layout/Navbar";

// Skeleton loader (build-plan.md §H) — matches MissionsPage's real layout
// shape (title/subtitle, a Board/List toggle + filter bar row, then a
// column-shaped Kanban skeleton), same pattern as the existing
// app/find-jobs/loading.tsx.
export default function MissionsLoading() {
  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full min-w-0 min-h-[calc(100vh-5rem)] max-w-360 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <div className="h-9 w-48 animate-pulse rounded-md bg-surface-secondary" />
          <div className="h-5 w-96 max-w-full animate-pulse rounded-md bg-surface-secondary" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-40 animate-pulse rounded-full bg-surface-secondary" />
          <div className="h-9 w-64 animate-pulse rounded-full bg-surface-secondary" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((col) => (
            <div key={col} className="flex flex-col gap-3">
              <div className="h-4 w-20 animate-pulse rounded-full bg-surface-secondary" />
              {[0, 1].map((card) => (
                <div key={card} className="h-24 animate-pulse rounded-2xl border border-border bg-surface p-4">
                  <div className="h-4 w-4/5 rounded-md bg-surface-secondary" />
                  <div className="mt-2 h-3 w-3/5 rounded-md bg-surface-secondary" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
