"use client";

import dynamic from "next/dynamic";

// Same ssr:false rationale as SettingsModalLoader.tsx — this listens for a
// global keydown (Cmd/Ctrl+K) and must actually run its effects, which only
// happens once truly mounted client-side. app/layout.tsx is a Server
// Component and can't call dynamic(..., {ssr:false}) directly, hence this
// small wrapper.
const CommandPalette = dynamic(
  () => import("@/components/ui/CommandPalette").then((mod) => mod.CommandPalette),
  { ssr: false },
);

export function CommandPaletteLoader() {
  return <CommandPalette />;
}
