// Shared "is this a genuinely public/logged-out route" check (build-plan.md
// §S performance pass). Previously duplicated informally — NavigatorLauncher.tsx
// had its own local isPublicRoute() that never got updated when /methodology,
// /pricing, and /ats-checker shipped this session, and CommandPalette.tsx had
// no gating at all despite every one of its commands pointing to an
// authenticated-only page. One shared list now, reused by both the inner
// components (so they never render on a public route) and their Loader
// wrappers (so the JS chunk for a genuinely irrelevant feature never even
// downloads on a public page — every command Navigator/the palette offer
// requires a logged-in user, so there's nothing useful to preload for a
// visitor who hasn't signed up yet).
export function isPublicMarketingRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/waitlist" ||
    pathname === "/methodology" ||
    pathname === "/pricing" ||
    pathname === "/ats-checker" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/preview")
  );
}
