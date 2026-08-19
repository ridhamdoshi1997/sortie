import { redirect } from "next/navigation";

import { getBroadcastsList } from "@/actions/adminMarketing";
import { getAdminRoster } from "@/actions/admin";
import { BroadcastEditor } from "@/components/admin/BroadcastEditor";

export const dynamic = "force-dynamic";

export default async function NewMarketingBroadcastPage() {
  const [listResult, rosterResult] = await Promise.all([getBroadcastsList(), getAdminRoster()]);
  if (!listResult.success || !rosterResult.success) {
    redirect("/dashboard");
  }
  if (rosterResult.viewerRole === "support_readonly") {
    redirect("/admin/marketing");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">New broadcast</h1>
        <p className="mt-1 text-sm text-text-secondary">Saved as a draft until you send it.</p>
      </div>
      <BroadcastEditor initialBroadcast={null} eligibleCount={listResult.eligibleCount} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
