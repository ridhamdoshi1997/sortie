"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";

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
// 2. Authoritative: POST /api/auth/refresh (this app's own route, now
//    backed by Supabase's getUser() server-side — see
//    app/api/auth/refresh/route.ts) to confirm/reconcile. A stale or
//    expired cookie downgrades back to false once this resolves.
//    Note: with @supabase/ssr's browser client, the cross-origin cookie
//    problem InsForge had (calling the backend's own absolute origin,
//    whose cookies don't ride along cross-origin) likely doesn't apply the
//    same way — @supabase/ssr stores the session in a cookie on THIS app's
//    own domain by design. This two-step pattern is kept as-is for now
//    (safer to preserve known-working behavior during migration) rather
//    than assuming that's fully true without live-testing it — worth
//    revisiting once Supabase auth is verified stable.
const AuthStateContext = createContext(false);

// Supabase's own documented cookie-naming convention for @supabase/ssr's
// browser client: `sb-<project-ref>-auth-token`. Derived from the project
// URL rather than hardcoded, so this doesn't silently break if the project
// URL env var ever changes.
function getAccessTokenCookieName(): string {
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([^.]+)\./)?.[1] ?? "";
  return `sb-${projectRef}-auth-token`;
}

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
