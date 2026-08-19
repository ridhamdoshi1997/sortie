import { redirect } from "next/navigation";

import { getBroadcastsList } from "@/actions/adminMarketing";
import { getPushSubscriberCount } from "@/actions/adminPush";
import { getSocialDraftsList } from "@/actions/adminSocialDrafts";
import { getReferralOverviewAction } from "@/actions/adminReferrals";
import { getOutreachSignalSettingsAction } from "@/actions/adminOutreachSettings";
import { getAdminRoster } from "@/actions/admin";
import { MarketingList } from "@/components/admin/MarketingList";
import { PushBroadcastForm } from "@/components/admin/PushBroadcastForm";
import { SocialDraftsQueue } from "@/components/admin/SocialDraftsQueue";
import { ReferralsOverview } from "@/components/admin/ReferralsOverview";
import { OutreachSignalSettingsCard } from "@/components/admin/OutreachSignalSettingsCard";

export const dynamic = "force-dynamic";

export default async function AdminMarketingPage() {
  const [result, rosterResult, pushSubscriberCount, socialDraftsResult, referralOverviewResult, outreachSettingsResult] = await Promise.all([
    getBroadcastsList(),
    getAdminRoster(),
    getPushSubscriberCount(),
    getSocialDraftsList(),
    getReferralOverviewAction(),
    getOutreachSignalSettingsAction(),
  ]);
  if (!result.success || !rosterResult.success) {
    redirect("/dashboard");
  }

  const canWrite = rosterResult.viewerRole === "owner" || rosterResult.viewerRole === "admin";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Marketing</h1>
        <p className="mt-1 text-sm text-text-secondary">Broadcast emails and push notifications to subscribed users.</p>
      </div>
      <MarketingList broadcasts={result.broadcasts} segmentCounts={result.segmentCounts} viewerRole={rosterResult.viewerRole} />
      <PushBroadcastForm subscriberCount={pushSubscriberCount} viewerRole={rosterResult.viewerRole} />
      <SocialDraftsQueue drafts={socialDraftsResult.success ? socialDraftsResult.drafts : []} canWrite={canWrite} />
      {referralOverviewResult.success && <ReferralsOverview overview={referralOverviewResult.overview} />}
      {outreachSettingsResult.success && <OutreachSignalSettingsCard initial={outreachSettingsResult.settings} canWrite={canWrite} />}
    </div>
  );
}
