"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";

import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { GlobalSearchBar } from "@/components/layout/GlobalSearchBar";
import { TimezoneSync } from "@/components/shared/TimezoneSync";
import { trackPostHogClientEvent } from "@/lib/posthog-client";

// Logged-out Features mega-menu (build-plan.md §S fast-follow) — grouped by
// Discovery/Application/Interviews per the original homepage research. Every
// href is a real anchor id on an existing feature card (BentoFeatures.tsx/
// TheLifecycle.tsx), not a dedicated per-feature page — those don't exist
// yet, and linking to a nonexistent page would be a worse experience than a
// precise deep-link into the real homepage content.
const FEATURES_MENU = [
  {
    title: "Discovery",
    items: [
      { href: "/#feature-evaluator", label: "10-Dimension Evaluator" },
      { href: "/#feature-extension", label: "Capture Extension" },
    ],
  },
  {
    title: "Application",
    items: [
      { href: "/#feature-tailoring", label: "ATS-Safe Résumé Tailoring" },
      { href: "/#feature-connections", label: "Insider Connections" },
    ],
  },
  {
    title: "Interviews",
    items: [
      { href: "/#feature-tracking", label: "Application Tracking" },
      { href: "/#feature-interview-prep", label: "Interview Prep" },
      { href: "/#feature-negotiation", label: "Negotiation Scripts" },
    ],
  },
];

type Props = {
  isAuthenticated?: boolean;
  // Off only for the public marketing homepage (app/page.tsx) — direct
  // user instruction: the persistent search bar is an app-shell feature
  // for after login/signup, not something a marketing landing page
  // should show even to a visitor who happens to be signed in already
  // (e.g. clicking the logo). Every other authenticated page keeps the
  // default true.
  showSearchBar?: boolean;
};

export function Navbar({ isAuthenticated = false, showSearchBar = true }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  // Features mega-menu (build-plan.md §S fast-follow) — logged-out nav
  // only, grouped by Discovery/Application/Interviews per the original
  // homepage research, each item deep-linking to a specific anchor id on
  // the real feature cards (BentoFeatures.tsx/TheLifecycle.tsx) rather than
  // just the top of the section.
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);

  // Close both menus on navigation — the React-sanctioned "adjust state
  // during render" pattern (not an effect) since this is React state
  // reacting to a React prop change, not syncing with an external system.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
    setFeaturesOpen(false);
  }

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (featuresRef.current && !featuresRef.current.contains(event.target as Node)) {
        setFeaturesOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFeaturesOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Logged-out marketing nav — deliberately separate from the authenticated
  // app nav below, not a filtered subset of it (build-plan.md §S). A signed-
  // out visitor was previously shown the exact same Dashboard/Jobs/Missions/
  // notification-bell/settings/command-palette chrome as a real user, all of
  // which either bounces to /login or makes no sense pre-account.
  if (!isAuthenticated) {
    return (
      <header className="sticky top-4 z-40 mx-4 mt-4 sm:mx-6 lg:mx-8">
        <div className="glass-panel-overlay mx-auto grid h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl px-4 sm:px-6 lg:px-8">
          <Logo priority variant="light" />

          <nav className="hidden items-center justify-center gap-6 md:flex">
            <div ref={featuresRef} className="relative">
              <button
                type="button"
                onClick={() => setFeaturesOpen((v) => !v)}
                aria-expanded={featuresOpen}
                className="inline-flex items-center gap-1 text-sm font-medium text-overlay-foreground/60 transition-colors hover:text-overlay-foreground"
              >
                Features
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${featuresOpen ? "rotate-180" : ""}`} />
              </button>
              {featuresOpen && (
                <div className="glass-panel-strong absolute left-1/2 top-full mt-2 w-[560px] -translate-x-1/2 rounded-xl p-4">
                  <div className="grid grid-cols-3 gap-4">
                    {FEATURES_MENU.map((group) => (
                      <div key={group.title}>
                        <p className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                          {group.title}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          {group.items.map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setFeaturesOpen(false)}
                              className="block rounded-lg px-2.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Link href="/ats-checker" className="text-sm font-medium text-overlay-foreground/60 transition-colors hover:text-overlay-foreground">
              Free ATS Checker
            </Link>
            <Link href="/methodology" className="text-sm font-medium text-overlay-foreground/60 transition-colors hover:text-overlay-foreground">
              Methodology
            </Link>
            <Link href="/news" className="text-sm font-medium text-overlay-foreground/60 transition-colors hover:text-overlay-foreground">
              News
            </Link>
            <Link href="/pricing" className="text-sm font-medium text-overlay-foreground/60 transition-colors hover:text-overlay-foreground">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center justify-end gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden text-sm font-medium text-overlay-foreground/70 transition-colors hover:text-overlay-foreground md:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/login?mode=signup"
              onClick={() => trackPostHogClientEvent("marketing_cta_clicked", { location: "nav_desktop" })}
              className="btn-signal hidden min-h-10 items-center rounded-md px-4 text-sm font-medium text-accent-foreground md:inline-flex"
            >
              Start for free
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="text-overlay-foreground/70 md:hidden"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="glass-panel-overlay mx-auto mt-2 w-full rounded-2xl p-3 md:hidden">
            <nav className="flex flex-col gap-1">
              <span className="block px-3 py-2 text-xs font-semibold uppercase tracking-wide text-overlay-foreground/40">
                Features
              </span>
              {FEATURES_MENU.flatMap((group) => group.items).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg px-3 py-2 pl-6 text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5"
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/ats-checker" className="block rounded-lg px-3 py-2 text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5">
                Free ATS Checker
              </Link>
              <Link href="/methodology" className="block rounded-lg px-3 py-2 text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5">
                Methodology
              </Link>
              <Link href="/news" className="block rounded-lg px-3 py-2 text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5">
                News
              </Link>
              <Link href="/pricing" className="block rounded-lg px-3 py-2 text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5">
                Pricing
              </Link>
              <div className="my-1 border-t border-overlay-foreground/10" />
              <Link href="/login" className="block rounded-lg px-3 py-2 text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5">
                Log in
              </Link>
              <Link
                href="/login?mode=signup"
                onClick={() => trackPostHogClientEvent("marketing_cta_clicked", { location: "nav_mobile" })}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-overlay-foreground/5"
              >
                Start for free
              </Link>
            </nav>
          </div>
        )}
      </header>
    );
  }

  // Authenticated shell — a persistent left sidebar (AppSidebar.tsx),
  // ported from the Redumecraft/Base44 reference app's layout and
  // recolored to this app's own accent/agent tokens. AppSidebar owns its
  // own nav/mobile-drawer state and toggles a body class that reserves
  // the sidebar's width for page content (see its own header comment) —
  // Navbar itself only needs to render it plus the existing search bar.
  return (
    <>
      <TimezoneSync />
      <AppSidebar />
      {showSearchBar && <GlobalSearchBar />}
    </>
  );
}
