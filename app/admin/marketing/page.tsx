import { redirect } from "next/navigation";

import { getBroadcastsList } from "@/actions/adminMarketing";
import { getAdminRoster } from "@/actions/admin";
import { MarketingList } from "@/components/admin/MarketingList";

export const dynamic = "force-dynamic";

export default async function AdminMarketingPage() {
  const [result, rosterResult] = await Promise.all([getBroadcastsList(), getAdminRoster()]);
  if (!result.success || !rosterResult.success) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Marketing</h1>
        <p className="mt-1 text-sm text-text-secondary">Broadcast emails to subscribed users. CAN-SPAM compliant — every send includes a real unsubscribe link.</p>
      </div>
      <MarketingList broadcasts={result.broadcasts} eligibleCount={result.eligibleCount} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
