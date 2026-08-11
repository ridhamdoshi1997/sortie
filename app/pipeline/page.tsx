export const dynamic = "force-dynamic";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { KanbanBoardLoader } from "@/components/pipeline/KanbanBoardLoader";
import type { Job } from "@/types";

export default async function PipelinePage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: jobs } = await insforge.database
    .from("jobs")
    .select(
      "id,title,company,company_logo_url,match_score,application_status,application_status_updated_at,marked_unavailable_at,dropped_from_search_at,found_at,rejection_diagnosis,rejection_diagnosed_at",
    )
    .eq("user_id", user.id)
    .eq("is_hidden", false)
    .order("found_at", { ascending: false });

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-360 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Pipeline</h1>
          <p className="text-base text-text-secondary sm:text-lg">
            Track every application from draft to offer — drag a card to move it.
          </p>
        </div>

        <KanbanBoardLoader jobs={(jobs ?? []) as Pick<
          Job,
          | "id"
          | "title"
          | "company"
          | "company_logo_url"
          | "match_score"
          | "application_status"
          | "application_status_updated_at"
          | "marked_unavailable_at"
          | "dropped_from_search_at"
          | "found_at"
          | "rejection_diagnosis"
          | "rejection_diagnosed_at"
        >[]} />
      </main>
    </>
  );
}
