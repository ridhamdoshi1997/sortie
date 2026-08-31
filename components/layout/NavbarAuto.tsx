"use client";

import { Navbar } from "@/components/layout/Navbar";
import { useAuthState } from "@/components/auth/AuthStateProvider";

// Thin wrapper so pages that need to render Navbar without a server-side
// getCurrentUser() call (app/page.tsx, app/pricing/page.tsx — see their
// comments) can still show the correct variant. Navbar itself is
// untouched — every other call site keeps passing isAuthenticated
// explicitly from a real server-side check as before.
export function NavbarAuto({ showSearchBar }: { showSearchBar?: boolean } = {}) {
  return <Navbar isAuthenticated={useAuthState()} showSearchBar={showSearchBar} />;
}
