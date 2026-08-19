"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, ShieldCheck, DollarSign } from "lucide-react";

// Shopify-shaped nav (2026-08-19, direct user request): a flat icon+label
// list, not the old header-only shell. Only links to pages that actually
// exist today — extend this list as each new section (Support, Content,
// Marketing, SEO) ships, per context/RESUME.md's admin-console expansion
// plan. Don't add a nav item for a page that doesn't exist yet.
const NAV_ITEMS = [
  { href: "/admin", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users, exact: false },
  { href: "/admin/team", label: "Team & Roles", icon: ShieldCheck, exact: false },
  { href: "/admin/expenses", label: "Expenses", icon: DollarSign, exact: false },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col bg-overlay text-overlay-foreground">
      <div className="border-b border-overlay-foreground/10 px-4 py-4">
        <p className="font-display text-sm font-bold uppercase tracking-wide">Sortie</p>
        <p className="font-mono text-[10px] uppercase tracking-widest text-overlay-foreground/40">Admin</p>
      </div>
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-overlay-foreground/65 hover:bg-overlay-foreground/10 hover:text-overlay-foreground"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
