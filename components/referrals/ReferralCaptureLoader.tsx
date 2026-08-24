"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

// Same ssr:false wrapper pattern as SettingsModalLoader.tsx/NavigatorLauncherLoader.tsx
// (mounts in app/layout.tsx, a Server Component wrapping fully static
// pages too). Suspense boundary is required here specifically because the
// inner component calls useSearchParams() — without it, Next.js forces the
// entire route tree into client-side rendering during the build.
const ReferralCapture = dynamic(
  () => import("@/components/referrals/ReferralCapture").then((mod) => mod.ReferralCapture),
  { ssr: false },
);

export function ReferralCaptureLoader() {
  return (
    <Suspense fallback={null}>
      <ReferralCapture />
    </Suspense>
  );
}
