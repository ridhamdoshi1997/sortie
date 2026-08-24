import { Navbar } from "@/components/layout/Navbar";

// Skeleton loader (build-plan.md §H) — matches DashboardPage's real
// 3-row bento-grid shape, same pattern as the existing
// app/find-jobs/loading.tsx.
function Card({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl border border-border bg-surface p-6 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-360 flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <Card className="h-56 lg:col-span-3" />
          <Card className="h-56" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="h-64" />
          <Card className="h-64 lg:col-span-2" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="h-52" />
          <Card className="h-52" />
        </div>
      </main>
    </>
  );
}
