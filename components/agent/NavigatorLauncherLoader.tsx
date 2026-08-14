"use client";

import dynamic from "next/dynamic";

// Same ssr:false wrapper pattern as SettingsModalLoader.tsx, for the same
// reason — this mounts in app/layout.tsx, a Server Component that also
// wraps fully static pages. Without ssr:false, a cold load risks the same
// "HTML present, zero React fiber attached, effects never fire" bug already
// hit and fixed once for the settings modal.
const NavigatorLauncher = dynamic(
  () => import("@/components/agent/NavigatorLauncher").then((mod) => mod.NavigatorLauncher),
  { ssr: false },
);

export function NavigatorLauncherLoader() {
  return <NavigatorLauncher />;
}
