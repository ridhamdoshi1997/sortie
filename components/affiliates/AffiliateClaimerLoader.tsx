"use client";

import dynamic from "next/dynamic";

// Same ssr:false wrapper pattern as ReferralClaimerLoader.tsx.
const AffiliateClaimer = dynamic(
  () => import("@/components/affiliates/AffiliateClaimer").then((mod) => mod.AffiliateClaimer),
  { ssr: false },
);

export function AffiliateClaimerLoader() {
  return <AffiliateClaimer />;
}
