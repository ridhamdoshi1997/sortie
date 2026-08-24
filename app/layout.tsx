import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { cn } from "@/lib/utils";
import { GlassCursorGlow } from "@/components/ui/GlassCursorGlow";
import { CommandPaletteLoader } from "@/components/ui/CommandPaletteLoader";
import { SettingsModalLoader } from "@/components/settings/SettingsModalLoader";
import { NavigatorLauncherLoader } from "@/components/agent/NavigatorLauncherLoader";
import { ReferralCaptureLoader } from "@/components/referrals/ReferralCaptureLoader";
import { ReferralClaimerLoader } from "@/components/referrals/ReferralClaimerLoader";
import { ServiceWorkerRegisterLoader } from "@/components/pwa/ServiceWorkerRegisterLoader";
import { ToastProvider } from "@/components/ui/ToastProvider";

// Installable PWA (build-plan.md §H). manifest + icons here are the two
// pieces Next.js's metadata API covers; the service worker itself
// (public/sw.js, already shipped for push notifications — deliberately NOT
// expanded into a full offline-caching worker here, matching this app's
// existing minimalism) is registered globally by ServiceWorkerRegisterLoader
// below, since it previously only ever registered when a user opened
// Settings -> Push, which isn't enough for real installability.
export const metadata: Metadata = {
  title: "Sortie",
  description:
    "Your career operations command center — scan the field, score what's worth your time, and land with a file on every target.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "antialiased", "font-sans")} suppressHydrationWarning>
      {/* overflow-x-hidden is a real, load-bearing safety net, not decorative —
          a real bug (found 2026-08-19) traced a page-wide horizontal scroll
          on /missions to Missions' Kanban board (a fixed-width-column flex
          row) stretching every flex-column ancestor up through this <body>,
          since flex-column items default to min-width:auto and don't shrink
          below their content unless BOTH min-w-0 is set on every ancestor in
          the chain AND the outermost one (<main>, defined per-page) has an
          explicit width. This clips any future similarly-wide descendant at
          the true root instead of letting it silently open a page-wide
          scrollbar — it does not affect any element's own intentional
          internal horizontal scroll (e.g. the Kanban board's own
          overflow-x-auto row), only overflow that would otherwise escape to
          the document itself. */}
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ToastProvider>
            <GlassCursorGlow />
            {children}
            <SettingsModalLoader />
            <NavigatorLauncherLoader />
            <CommandPaletteLoader />
            <ReferralCaptureLoader />
            <ReferralClaimerLoader />
            <ServiceWorkerRegisterLoader />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
