import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { cn } from "@/lib/utils";
import { GlassCursorGlow } from "@/components/ui/GlassCursorGlow";
import { CommandPaletteLoader } from "@/components/ui/CommandPaletteLoader";
import { SettingsModalLoader } from "@/components/settings/SettingsModalLoader";
import { NavigatorLauncherLoader } from "@/components/agent/NavigatorLauncherLoader";
import { ReferralCaptureLoader } from "@/components/referrals/ReferralCaptureLoader";
import { ReferralClaimerLoader } from "@/components/referrals/ReferralClaimerLoader";
import { AffiliateCaptureLoader } from "@/components/affiliates/AffiliateCaptureLoader";
import { AffiliateClaimerLoader } from "@/components/affiliates/AffiliateClaimerLoader";
import { ServiceWorkerRegisterLoader } from "@/components/pwa/ServiceWorkerRegisterLoader";
import { ToastProvider } from "@/components/ui/ToastProvider";

// Signal redesign (feature/signal-redesign) — self-hosted via next/font/google
// rather than the mockup's runtime @import, avoiding FOUC/layout shift.
// Inter replaces the system-sans stack for UI text; Fraunces is new and
// stays scoped to --font-display's existing narrow role (wordmark + hero
// headings only, per ui-tokens.md's own invariant — unchanged here, just a
// different display face). Both expose a CSS variable consumed by
// globals.css's --font-sans/--font-display instead of a raw font-family,
// so the system-stack fallback still applies if the webfont fails to load.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

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
  // iOS ignores the web manifest for "Add to Home Screen" — Safari only
  // reads these apple-specific meta tags, which Next's metadata API doesn't
  // emit unless explicitly asked (found missing while auditing this
  // session's PWA work; the manifest/icons/theme-color above only ever
  // covered Chrome/Android). statusBarStyle "black-translucent" lets the
  // app's own dark chrome show through the iOS status bar instead of a
  // separate opaque bar, matching the standalone/dark theme_color above.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sortie",
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
    <html
      lang="en"
      className={cn("h-full", "antialiased", "font-sans", inter.variable, fraunces.variable)}
      suppressHydrationWarning
    >
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
            <AffiliateCaptureLoader />
            <AffiliateClaimerLoader />
            <ServiceWorkerRegisterLoader />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
