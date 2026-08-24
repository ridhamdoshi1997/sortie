import { redirect } from "next/navigation";

import { getAdminRoster } from "@/actions/admin";
import { PageEditor } from "@/components/admin/PageEditor";

export const dynamic = "force-dynamic";

export default async function NewContentPage() {
  const rosterResult = await getAdminRoster();
  if (!rosterResult.success) {
    redirect("/dashboard");
  }
  if (rosterResult.viewerRole === "support_readonly") {
    redirect("/admin/content");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">New page</h1>
        <p className="mt-1 text-sm text-text-secondary">Saved as a draft until you publish it.</p>
      </div>
      <PageEditor initialPage={null} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
