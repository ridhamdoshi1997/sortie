import { redirect } from "next/navigation";

import { getPagesList } from "@/actions/adminContent";
import { getAdminRoster } from "@/actions/admin";
import { ContentList } from "@/components/admin/ContentList";

export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  const [pagesResult, rosterResult] = await Promise.all([getPagesList(), getAdminRoster()]);

  if (!pagesResult.success || !rosterResult.success) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Content</h1>
        <p className="mt-1 text-sm text-text-secondary">Markdown pages, published at /blog/[slug]. Draft, preview, and publish.</p>
      </div>
      <ContentList pages={pagesResult.pages} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
