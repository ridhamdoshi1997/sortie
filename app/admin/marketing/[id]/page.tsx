import { redirect, notFound } from "next/navigation";

import { getBroadcastDetail, getBroadcastsList } from "@/actions/adminMarketing";
import { getAdminRoster } from "@/actions/admin";
import { BroadcastEditor } from "@/components/admin/BroadcastEditor";

export const dynamic = "force-dynamic";

export default async function MarketingBroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detailResult, listResult, rosterResult] = await Promise.all([getBroadcastDetail(id), getBroadcastsList(), getAdminRoster()]);

  if (!listResult.success || !rosterResult.success) {
    redirect("/dashboard");
  }
  if (!detailResult.success) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{detailResult.broadcast.subject}</h1>
      </div>
      <BroadcastEditor initialBroadcast={detailResult.broadcast} eligibleCount={listResult.eligibleCount} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
