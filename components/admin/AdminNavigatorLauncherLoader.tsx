"use client";

import dynamic from "next/dynamic";

// Same ssr:false wrapper as components/agent/NavigatorLauncherLoader.tsx,
// for the same real reason — this mounts in app/admin/layout.tsx, a
// Server Component, and skipping ssr:false risks the documented
// "HTML present, zero React fiber attached, effects never fire" bug.
const AdminNavigatorLauncher = dynamic(
  () => import("@/components/admin/AdminNavigatorLauncher").then((mod) => mod.AdminNavigatorLauncher),
  { ssr: false },
);

export function AdminNavigatorLauncherLoader() {
  return <AdminNavigatorLauncher />;
}
