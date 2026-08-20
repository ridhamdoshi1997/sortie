"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { isPublicMarketingRoute } from "@/lib/publicRoutes";

// Same ssr:false rationale as SettingsModalLoader.tsx — this listens for a
// global keydown (Cmd/Ctrl+K) and must actually run its effects, which only
// happens once truly mounted client-side. app/layout.tsx is a Server
// Component and can't call dynamic(..., {ssr:false}) directly, hence this
// small wrapper.
const CommandPalette = dynamic(
  () => import("@/components/ui/CommandPalette").then((mod) => mod.CommandPalette),
  { ssr: false },
);

// Homepage performance pass (2026-08-20): every command here points to an
// authenticated-only page, and CommandPalette.tsx previously had NO public-
// route gating at all — Cmd+K worked on the marketing homepage and opened a
// palette full of links that just bounce to /login. Gating here also means
// the JS chunk itself never downloads on a public page.
export function CommandPaletteLoader() {
  const pathname = usePathname();
  if (isPublicMarketingRoute(pathname)) return null;
  return <CommandPalette />;
}
