"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, UserCircle } from "lucide-react";

import { Logo } from "@/components/layout/Logo";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { PostHogLogoutLink } from "@/components/analytics/PostHogLogoutLink";

const navigationItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/find-jobs", label: "Find Jobs" },
  { href: "/saved-jobs", label: "Saved Jobs" },
  { href: "/profile", label: "Profile" },
];

type Props = {
  isAuthenticated?: boolean;
};

export function Navbar({ isAuthenticated = false }: Props) {
  const pathname = usePathname();

  return (
    <header className="glass-panel-overlay">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo priority variant="light" />

        <nav className="hidden items-center gap-8 md:flex">
          {navigationItems.map((item) => {
            const isActive =
              item.href === "/find-jobs"
                ? pathname.startsWith("/find-jobs")
                : pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "text-sm font-medium transition-colors",
                  isActive ? "text-accent" : "text-overlay-foreground/60 hover:text-overlay-foreground",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {isAuthenticated ? (
          <div className="flex items-center gap-6">
            <ThemeToggle />
            <UserCircle className="hidden h-6 w-6 text-overlay-foreground/50 sm:block" />
            <PostHogLogoutLink className="inline-flex items-center gap-2 text-sm font-medium text-overlay-foreground/70 transition-colors hover:text-overlay-foreground">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </PostHogLogoutLink>
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <ThemeToggle />
            <Link
              href="/login"
              className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              Start for free
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
