export const dynamic = "force-dynamic";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { MissionsView } from "@/components/missions/MissionsView";
import type { Job } from "@/types";

export default async function MissionsPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  // Full row, not the old lean Kanban-only column list — MissionsView's
  // List mode reuses JobResultCard, which needs the full Job shape.
  const { data: jobs } = await insforge.database
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_hidden", false)
    .order("found_at", { ascending: false });

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-360 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Missions</h1>
          <p className="text-base text-text-secondary sm:text-lg">
            Every application you&apos;re running, tracked from draft to offer — drag a card to
            move it, or switch to a filtered list.
          </p>
        </div>

        <MissionsView jobs={(jobs ?? []) as Job[]} />
      </main>
    </>
  );
}
