"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { isPublicMarketingRoute } from "@/lib/publicRoutes";

// Same ssr:false wrapper pattern as SettingsModalLoader.tsx, for the same
// reason — this mounts in app/layout.tsx, a Server Component that also
// wraps fully static pages. Without ssr:false, a cold load risks the same
// "HTML present, zero React fiber attached, effects never fire" bug already
// hit and fixed once for the settings modal.
const NavigatorLauncher = dynamic(
  () => import("@/components/agent/NavigatorLauncher").then((mod) => mod.NavigatorLauncher),
  { ssr: false },
);

// Homepage performance pass (2026-08-20): NavigatorLauncher.tsx already
// bailed out internally on public routes, but next/dynamic's import()
// fires as soon as this component is instantiated — the inner bail-out
// happened AFTER the JS chunk had already downloaded, not before. Checking
// the route here means a public-page visitor never fetches this chunk at
// all, since every one of Navigator's actions requires a logged-in user
// (nothing useful to preload).
export function NavigatorLauncherLoader() {
  const pathname = usePathname();
  if (isPublicMarketingRoute(pathname)) return null;
  return <NavigatorLauncher />;
}
