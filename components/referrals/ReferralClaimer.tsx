"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { claimReferralCode } from "@/actions/referrals";

const STORAGE_KEY = "sortie_pending_referral";

// Same "no shared authenticated layout" reasoning as
// NavigatorLauncher.tsx's isPublicRoute — gates by known-public path
// prefixes rather than a client-side auth check. claimReferralCode itself
// also calls requireUser() server-side, so an unauthenticated call here
// (edge case: user still on a gated route while logged out) just fails
// silently, never crashes anything.
function isPublicRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/login" || pathname === "/waitlist" || pathname.startsWith("/preview") || pathname.startsWith("/blog");
}

export function ReferralClaimer() {
  const pathname = usePathname();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (isPublicRoute(pathname)) return;

    let pending: { code: string } | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) pending = JSON.parse(raw) as { code: string };
    } catch {
      return;
    }
    if (!pending?.code) return;

    attempted.current = true;
    claimReferralCode(pending.code).then((result) => {
      // Clear on any resolved outcome — success, "already claimed"
      // no-op, self-referral rejection, or a stale/unknown code. Only a
      // thrown network error would leave it to retry on the next
      // authenticated page load.
      if (result.success || result.error) {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    });
  }, [pathname]);

  return null;
}
