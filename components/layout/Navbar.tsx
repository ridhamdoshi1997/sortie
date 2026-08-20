"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCircle,
  X,
} from "lucide-react";

import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { PostHogLogoutLink } from "@/components/analytics/PostHogLogoutLink";
import { getUnreadNotificationCount } from "@/actions/notifications";

const jobsSubItems = [
  { href: "/find-jobs", label: "Recommended" },
  { href: "/saved-jobs", label: "Liked" },
  { href: "/jobs/external", label: "External" },
];

// "Profile" lives under the profile icon in the right-hand cluster, not as
// a top-level nav item — one fewer item competing for space in an already
// full horizontal bar, and matches the icon's own obvious affordance.
// "Missions" (the application tracker, renamed from "Pipeline" 2026-08-12 —
// see MissionsView.tsx's own comment for the naming rationale) is a
// top-level item, not folded into the Jobs dropdown like the old
// /jobs/applied sub-item it replaces — it's meant to be a daily-return
// surface (spine #1 feature), not a filtered view of the job list.
// "Career" (spine #2, portable career identity) gets the same top-level
// treatment for the same reason — it's meant to be visited whether or not
// the user is actively job hunting, not buried.
const navigationItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs", sub: jobsSubItems },
  { href: "/missions", label: "Missions" },
  { href: "/career", label: "Career" },
  { href: "/resume", label: "Resume" },
  { href: "/interview", label: "Interview" },
];

function isItemActive(href: string, pathname: string): boolean {
  if (href === "/jobs") {
    return jobsSubItems.some((s) => pathname.startsWith(s.href)) || pathname.startsWith("/jobs");
  }
  if (href === "/find-jobs") return pathname.startsWith("/find-jobs");
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  isAuthenticated?: boolean;
};

export function Navbar({ isAuthenticated = false }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [jobsOpen, setJobsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const jobsRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Notification bell badge — fetched once on mount, re-checked on route
  // change (a status change elsewhere in the app may have just created
  // one). Deliberately not a live subscription for v1 — a page-load-fresh
  // count is enough for a bell icon badge, not worth a realtime channel.
  useEffect(() => {
    if (!isAuthenticated) return;
    getUnreadNotificationCount().then((result) => {
      if (result.success) setUnreadCount(result.count);
    });
  }, [isAuthenticated, pathname]);

  // Close both menus on navigation — the React-sanctioned "adjust state
  // during render" pattern (not an effect) since this is React state
  // reacting to a React prop change, not syncing with an external system.
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setJobsOpen(false);
    setMobileOpen(false);
  }

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (jobsRef.current && !jobsRef.current.contains(event.target as Node)) {
        setJobsOpen(false);
      }
    }
    // WCAG 2.1.1 keyboard-operability fix (accessibility audit, 2026-08-20)
    // — this menu previously had no keyboard way to close at all.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setJobsOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const linkClass = (active: boolean) =>
    [
      "text-sm font-medium transition-colors duration-200 ease-in-out",
      active ? "text-accent" : "text-overlay-foreground/60 hover:text-overlay-foreground",
    ].join(" ");

  // Opens the settings modal (components/settings/SettingsModal.tsx) over
  // the current page instead of navigating away to /settings — reads
  // window.location.search at click time rather than useSearchParams() so
  // Navbar itself doesn't need a Suspense boundary at every call site.
  function openSettings() {
    const params = new URLSearchParams(window.location.search);
    params.set("settings", "1");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // CommandPalette.tsx (mounted once in app/layout.tsx) is the only
  // listener — a plain window event is simpler here than lifting state or
  // adding a context provider for one global boolean toggle.
  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("sortie:open-command-palette"));
  }

  return (
    <header className="sticky top-4 z-40 mx-4 mt-4 sm:mx-6 lg:mx-8">
      <div className="glass-panel-overlay mx-auto grid h-16 max-w-[1400px] grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <Logo priority variant="light" />
        </div>

        <nav className="hidden items-center justify-center gap-5 md:flex">
          {navigationItems.map((item) => {
            const active = isItemActive(item.href, pathname);

            if (item.sub) {
              return (
                <div key={item.href} ref={jobsRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setJobsOpen((v) => !v)}
                    className={`inline-flex items-center gap-1 ${linkClass(active)}`}
                    aria-expanded={jobsOpen}
                  >
                    {item.label}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${jobsOpen ? "rotate-180" : ""}`} />
                  </button>
                  {jobsOpen && (
                    <div className="glass-panel-strong absolute left-1/2 top-full mt-2 w-48 -translate-x-1/2 rounded-xl p-1.5">
                      {item.sub.map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className="block rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-200 ease-in-out hover:bg-surface-secondary hover:text-text-primary"
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link key={item.href} href={item.href} className={linkClass(active)}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Open command palette"
            className="hidden items-center gap-1.5 rounded-full border border-overlay-foreground/15 px-2.5 py-1 text-overlay-foreground/60 transition-colors duration-200 ease-in-out hover:border-overlay-foreground/30 hover:text-overlay-foreground sm:inline-flex"
          >
            <Search className="h-3.5 w-3.5" />
            <kbd className="font-mono text-[10px]">&#8984;K</kbd>
          </button>
          <button
            type="button"
            onClick={openSettings}
            aria-label="Settings"
            className="hidden text-overlay-foreground/60 transition-colors duration-200 ease-in-out hover:text-overlay-foreground sm:block"
          >
            <Settings className="h-5 w-5" />
          </button>
          <Link
            href="/notifications"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            className="relative hidden text-overlay-foreground/60 transition-colors duration-200 ease-in-out hover:text-overlay-foreground sm:block"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-semibold text-accent-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <ThemeToggle />

          {isAuthenticated ? (
            <div className="hidden items-center gap-6 md:flex">
              <Link
                href="/profile"
                aria-label="Profile"
                className={`transition-colors duration-200 ease-in-out ${
                  isItemActive("/profile", pathname) ? "text-accent" : "text-overlay-foreground/50 hover:text-overlay-foreground"
                }`}
              >
                <UserCircle className="h-6 w-6" />
              </Link>
              <PostHogLogoutLink className="inline-flex items-center gap-2 text-sm font-medium text-overlay-foreground/70 transition-colors duration-200 ease-in-out hover:text-overlay-foreground">
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </PostHogLogoutLink>
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 md:inline-flex"
            >
              Start for free
            </Link>
          )}

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
        <div className="glass-panel-overlay mx-auto mt-2 max-w-[1400px] rounded-2xl p-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {navigationItems.map((item) => (
              <div key={item.href}>
                {item.sub ? (
                  <>
                    <span className="block px-3 py-2 text-xs font-semibold uppercase tracking-wide text-overlay-foreground/40">
                      {item.label}
                    </span>
                    {item.sub.map((sub) => (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className="block rounded-lg px-3 py-2 pl-6 text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5 hover:text-overlay-foreground"
                      >
                        {sub.label}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium hover:bg-overlay-foreground/5 ${
                      isItemActive(item.href, pathname) ? "text-accent" : "text-overlay-foreground/70"
                    }`}
                  >
                    {item.label}
                  </Link>
                )}
              </div>
            ))}
            <div className="my-1 border-t border-overlay-foreground/10" />
            {isAuthenticated && (
              <Link
                href="/profile"
                className={`block rounded-lg px-3 py-2 text-sm font-medium hover:bg-overlay-foreground/5 ${
                  isItemActive("/profile", pathname) ? "text-accent" : "text-overlay-foreground/70"
                }`}
              >
                Profile
              </Link>
            )}
            <button
              type="button"
              onClick={openSettings}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5"
            >
              Settings
            </button>
            <Link
              href="/notifications"
              className="block rounded-lg px-3 py-2 text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5"
            >
              Notifications
            </Link>
            {isAuthenticated ? (
              <PostHogLogoutLink className="block rounded-lg px-3 py-2 text-left text-sm font-medium text-overlay-foreground/70 hover:bg-overlay-foreground/5">
                Sign out
              </PostHogLogoutLink>
            ) : (
              <Link
                href="/login"
                className="block rounded-lg px-3 py-2 text-sm font-medium text-accent hover:bg-overlay-foreground/5"
              >
                Start for free
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
