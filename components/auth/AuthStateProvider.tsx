"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { getAccessTokenCookieName } from "@insforge/sdk/ssr";

// Lets app/page.tsx and app/pricing/page.tsx render as static Server
// Components (no cookies() access) instead of forcing the whole route
// dynamic just to pick a Navbar/CTA variant — see those files' own
// comments for the caching problem this replaces. Computes the real
// signed-in state client-side instead, once, shared via context so
// NavbarAuto/FreeTierCta/PlanUpgradeCta don't each redo the check.
//
// Two-step resolution, not one round trip:
// 1. Optimistic: does the (non-httpOnly) access-token cookie merely
//    EXIST? Read via useSyncExternalStore (not a setState-in-effect —
//    the React-endorsed way to read a browser-only value without a
//    hydration mismatch: getServerSnapshot always returns false,
//    matching the static HTML, and React itself reconciles the real
//    client value on hydration) — a real returning user sees the
//    authenticated UI almost immediately, no network wait.
// 2. Authoritative: POST /api/auth/refresh (this app's own route,
//    already wired to createRefreshAuthRouter() — see
//    app/api/auth/refresh/route.ts) to confirm/reconcile. A stale or
//    expired cookie downgrades back to false once this resolves.
//    Deliberately NOT using insforge.auth.getCurrentUser() (from
//    lib/insforge-client.ts) here — traced through the installed SDK
//    and confirmed its cold-load path (no in-memory session yet)
//    calls refreshSession(), which posts to the InsForge backend's
//    own absolute origin, not this app's — cookies scoped to this
//    app's domain won't ride along cross-origin, so it would
//    misreport real signed-in users as signed-out. This app's own
//    /api/auth/refresh route handler runs the same check
//    server-side against the real request cookie, no cross-origin
//    problem.
const AuthStateContext = createContext(false);

function hasAccessTokenCookie(): boolean {
  const name = getAccessTokenCookieName();
  return document.cookie.split("; ").some((entry) => entry.startsWith(`${name}=`) && entry.length > name.length + 1);
}

function getServerSnapshot(): boolean {
  return false;
}

// Cookie presence never changes without a full page reconciliation
// cycle from the effect below, so there's nothing to subscribe to —
// useSyncExternalStore just needs a stable no-op unsubscribe here.
function subscribe(): () => void {
  return () => {};
}

export function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const cookiePresent = useSyncExternalStore(subscribe, hasAccessTokenCookie, getServerSnapshot);
  // null = authoritative check hasn't resolved yet, so fall back to the
  // optimistic cookie-presence read; true/false once /api/auth/refresh
  // actually confirms it (see effect below).
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { user?: unknown } | null) => {
        if (!cancelled) setConfirmed(Boolean(body?.user));
      })
      .catch(() => {
        if (!cancelled) setConfirmed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthenticated = confirmed ?? cookiePresent;

  return <AuthStateContext.Provider value={isAuthenticated}>{children}</AuthStateContext.Provider>;
}

export function useAuthState(): boolean {
  return useContext(AuthStateContext);
}
