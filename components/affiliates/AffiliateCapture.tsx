"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "sortie_pending_affiliate";
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Affiliate-program counterpart to components/referrals/ReferralCapture.tsx
// — same "write-only, capture happens here, claim happens later after
// login" split, deliberately a separate query param (?aff=) and storage
// key so an affiliate click and a peer-referral click never collide or
// overwrite each other's attribution.
export function AffiliateCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("aff");
    if (!code) return;

    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing) {
        const parsed = JSON.parse(existing) as { code: string; capturedAt: number };
        if (Date.now() - parsed.capturedAt < EXPIRY_MS) return;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, capturedAt: Date.now() }));
    } catch {
      // localStorage unavailable (private browsing, etc.) — silently skip.
    }
  }, [searchParams]);

  return null;
}
