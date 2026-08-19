import { redirect, notFound } from "next/navigation";

import { getPageDetail } from "@/actions/adminContent";
import { getAdminRoster } from "@/actions/admin";
import { PageEditor } from "@/components/admin/PageEditor";

export const dynamic = "force-dynamic";

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [pageResult, rosterResult] = await Promise.all([getPageDetail(id), getAdminRoster()]);

  if (!pageResult.success || !rosterResult.success) {
    redirect("/dashboard");
  }
  if (!pageResult.page) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{pageResult.page.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">/{pageResult.page.slug}</p>
      </div>
      <PageEditor initialPage={pageResult.page} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
