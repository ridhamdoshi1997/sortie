"use client";

import dynamic from "next/dynamic";

// Same ssr:false wrapper pattern as the other root-mounted loaders.
const ReferralClaimer = dynamic(
  () => import("@/components/referrals/ReferralClaimer").then((mod) => mod.ReferralClaimer),
  { ssr: false },
);

export function ReferralClaimerLoader() {
  return <ReferralClaimer />;
}
