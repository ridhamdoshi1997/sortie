import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { cn } from "@/lib/utils";
import { GlassCursorGlow } from "@/components/ui/GlassCursorGlow";
import { CommandPaletteLoader } from "@/components/ui/CommandPaletteLoader";
import { SettingsModalLoader } from "@/components/settings/SettingsModalLoader";
import { NavigatorLauncherLoader } from "@/components/agent/NavigatorLauncherLoader";

export const metadata: Metadata = {
  title: "Sortie",
  description:
    "Your career operations command center — scan the field, score what's worth your time, and land with a file on every target.",
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
          <GlassCursorGlow />
          {children}
          <SettingsModalLoader />
          <NavigatorLauncherLoader />
          <CommandPaletteLoader />
        </ThemeProvider>
      </body>
    </html>
  );
}
