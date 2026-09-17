"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Briefcase,
  ChevronDown,
  Compass,
  FileText,
  KanbanSquare,
  LogOut,
  Mic,
  Menu,
  Newspaper,
  LayoutDashboard,
  Search,
  Settings,
  TrendingUp,
  UserCircle,
  X,
} from "lucide-react";

import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { PostHogLogoutLink } from "@/components/analytics/PostHogLogoutLink";
import { SiteModelSelector } from "@/components/shared/SiteModelSelector";
import { getUnreadNotificationCount } from "@/actions/notifications";

// Left-sidebar app shell, replacing the old top pill nav for the
// authenticated app (direct user request, ported from the Redumecraft/
// Base44 reference app's shadcn Sidebar composition — same grouped
// icon+label structure, recolored to Sortie's own accent/agent tokens
// instead of that reference's green). Deliberately NOT the full generic
// shadcn Sidebar engine (SidebarProvider/Sheet/cookie-persisted
// collapse/keyboard shortcut) — this app has no Radix/Sheet primitives
// today and doesn't need icon-rail collapsing, so a purpose-built
// component matching the same visual outcome avoids a new dependency
// footprint. See Navbar.tsx's authenticated branch, which renders this.
const jobsSubItems = [
  { href: "/jobs/recommended", label: "Recommended" },
  { href: "/find-jobs", label: "Search" },
  { href: "/saved-jobs", label: "Saved" },
  { href: "/jobs/external", label: "External" },
];

const primaryItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase, sub: jobsSubItems },
  { href: "/missions", label: "Missions", icon: KanbanSquare },
  { href: "/career", label: "Career", icon: Compass },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/interview", label: "Interview", icon: Mic },
  { href: "/news", label: "News", icon: Newspaper },
];

function isItemActive(href: string, pathname: string): boolean {
  if (href === "/jobs") {
    return jobsSubItems.some((s) => pathname.startsWith(s.href)) || pathname.startsWith("/jobs");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Toggles a class on <body> so page content gets a left margin equal to
// the sidebar's width — this is what lets every existing page keep
// rendering <Navbar isAuthenticated /> as its first element, unchanged,
// instead of needing a wrapper edit across ~35 page files. Scoped to the
// authenticated shell only (this component only mounts on that branch);
// the public marketing nav's own top-bar layout is untouched.
function useSidebarBodyClass() {
  useEffect(() => {
    document.body.classList.add("has-app-sidebar");
    return () => {
      document.body.classList.remove("has-app-sidebar");
    };
  }, []);
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [jobsOpen, setJobsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const jobsRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useSidebarBodyClass();

  useEffect(() => {
    getUnreadNotificationCount().then((result) => {
      if (result.success) setUnreadCount(result.count);
    });
  }, [pathname]);

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

  function openSettings() {
    const params = new URLSearchParams(window.location.search);
    params.set("settings", "1");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function openSubscriptionSettings() {
    const params = new URLSearchParams(window.location.search);
    params.set("settings", "1");
    params.set("tab", "subscription");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("sortie:open-command-palette"));
  }

  const itemClass = (active: boolean) =>
    [
      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ease-in-out",
      active ? "bg-accent-light text-accent" : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
    ].join(" ");

  const sidebarBody = (
    <div className="flex h-full w-64 flex-col bg-surface">
      <div className="border-b border-border p-5">
        <Logo priority />
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <p className="px-3 pb-2 pt-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Workspace
        </p>
        <div className="flex flex-col gap-1">
          {primaryItems.map((item) => {
            const active = isItemActive(item.href, pathname);
            const Icon = item.icon;

            if (item.sub) {
              return (
                <div key={item.href} ref={jobsRef}>
                  <button
                    type="button"
                    onClick={() => setJobsOpen((v) => !v)}
                    aria-expanded={jobsOpen}
                    className={`w-full ${itemClass(active)}`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${jobsOpen ? "rotate-180" : ""}`} />
                  </button>
                  {jobsOpen && (
                    <div className="ml-[18px] mt-1 flex flex-col gap-0.5 border-l border-border pl-4">
                      {item.sub.map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className="rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
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
              <Link key={item.href} href={item.href} className={itemClass(active)}>
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <p className="px-3 pb-2 pt-5 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Account
        </p>
        <div className="flex flex-col gap-1">
          <Link href="/notifications" className={itemClass(isItemActive("/notifications", pathname))}>
            <span className="relative">
              <Bell className="h-[18px] w-[18px] shrink-0" />
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 font-mono text-[9px] font-semibold text-accent-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </span>
            Notifications
          </Link>
          <button type="button" onClick={openSettings} className={`w-full ${itemClass(false)}`}>
            <Settings className="h-[18px] w-[18px] shrink-0" />
            Settings
          </button>
          <Link href="/profile" className={itemClass(isItemActive("/profile", pathname))}>
            <UserCircle className="h-[18px] w-[18px] shrink-0" />
            Profile
          </Link>
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={openSubscriptionSettings}
          className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-accent-muted px-3 py-1.5 text-xs font-semibold text-accent transition-opacity hover:opacity-90"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Upgrade
        </button>
        <div className="mb-2 flex items-center justify-between gap-1 rounded-xl border border-border-light bg-surface-tertiary px-2 py-1.5">
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Open command palette"
            className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-text-secondary transition-colors hover:text-text-primary"
          >
            <Search className="h-4 w-4" />
            <kbd className="font-mono text-[10px]">&#8984;K</kbd>
          </button>
          <SiteModelSelector />
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5">
          <Link href="/profile" className="flex min-w-0 items-center gap-2 text-text-secondary transition-colors hover:text-text-primary">
            <UserCircle className="h-8 w-8 shrink-0 text-text-muted" />
            <span className="truncate text-sm font-medium">Account</span>
          </Link>
          <PostHogLogoutLink
            aria-label="Sign out"
            className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
          >
            <LogOut className="h-4 w-4" />
          </PostHogLogoutLink>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: persistent fixed sidebar. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden border-r border-border lg:block">{sidebarBody}</aside>

      {/* Mobile: slim top bar + slide-out drawer, same content. */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
        <Logo priority />
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          className="text-text-secondary"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-xl">{sidebarBody}</div>
        </div>
      )}
    </>
  );
}
