"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const STORAGE_KEY = "sortie_pending_referral";
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Mounted once at the root layout (works for anonymous visitors landing on
// the marketing homepage via a friend's link, same as every other
// always-mounted root loader in this app). Only ever WRITES a pending code
// to localStorage — the actual claim (a DB write) happens later, after
// login, in ReferralClaimer.tsx. Never overwrites an already-pending code
// with a second visit's code — first link clicked wins, matching how most
// referral programs attribute credit.
export function ReferralCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("ref");
    if (!code) return;

    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing) {
        const parsed = JSON.parse(existing) as { code: string; capturedAt: number };
        if (Date.now() - parsed.capturedAt < EXPIRY_MS) return;
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, capturedAt: Date.now() }));
    } catch {
      // localStorage unavailable (private browsing, etc.) — silently skip,
      // this is a nice-to-have growth mechanic, never load-bearing.
    }
  }, [searchParams]);

  return null;
}
