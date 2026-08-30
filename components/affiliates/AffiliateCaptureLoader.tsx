"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

// Same ssr:false + Suspense wrapper pattern as ReferralCaptureLoader.tsx —
// required because the inner component calls useSearchParams().
const AffiliateCapture = dynamic(
  () => import("@/components/affiliates/AffiliateCapture").then((mod) => mod.AffiliateCapture),
  { ssr: false },
);

export function AffiliateCaptureLoader() {
  return (
    <Suspense fallback={null}>
      <AffiliateCapture />
    </Suspense>
  );
}
