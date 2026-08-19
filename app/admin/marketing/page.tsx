import { redirect } from "next/navigation";

import { getBroadcastsList } from "@/actions/adminMarketing";
import { getPushSubscriberCount } from "@/actions/adminPush";
import { getAdminRoster } from "@/actions/admin";
import { MarketingList } from "@/components/admin/MarketingList";
import { PushBroadcastForm } from "@/components/admin/PushBroadcastForm";

export const dynamic = "force-dynamic";

export default async function AdminMarketingPage() {
  const [result, rosterResult, pushSubscriberCount] = await Promise.all([getBroadcastsList(), getAdminRoster(), getPushSubscriberCount()]);
  if (!result.success || !rosterResult.success) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Marketing</h1>
        <p className="mt-1 text-sm text-text-secondary">Broadcast emails and push notifications to subscribed users.</p>
      </div>
      <MarketingList broadcasts={result.broadcasts} segmentCounts={result.segmentCounts} viewerRole={rosterResult.viewerRole} />
      <PushBroadcastForm subscriberCount={pushSubscriberCount} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
