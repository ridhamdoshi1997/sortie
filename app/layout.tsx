import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { cn } from "@/lib/utils";
import { GlassCursorGlow } from "@/components/ui/GlassCursorGlow";
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
      <body className="flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <GlassCursorGlow />
          {children}
          <SettingsModalLoader />
          <NavigatorLauncherLoader />
        </ThemeProvider>
      </body>
    </html>
  );
}
