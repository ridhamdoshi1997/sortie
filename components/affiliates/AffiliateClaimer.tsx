"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { claimAffiliateCode } from "@/actions/affiliates";

const STORAGE_KEY = "sortie_pending_affiliate";

// Affiliate-program counterpart to components/referrals/ReferralClaimer.tsx
// — same isPublicRoute gate and "clear on any resolved outcome" logic.
function isPublicRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/login" || pathname === "/waitlist" || pathname.startsWith("/preview") || pathname.startsWith("/blog");
}

export function AffiliateClaimer() {
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
    claimAffiliateCode(pending.code).then((result) => {
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
