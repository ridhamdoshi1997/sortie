"use client";

import { TrackedCtaLink } from "@/components/homepage/TrackedCtaLink";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { useAuthState } from "@/components/auth/AuthStateProvider";

// Split out of CTASection.tsx so that component can stop calling
// getCurrentUser() server-side (see its own comment) — this is the one
// piece of a paid plan's card that actually varies by auth state.
export function PlanUpgradeCta({ tier, displayName, isLifetime }: { tier: string; displayName: string; isLifetime: boolean }) {
  const isAuthenticated = useAuthState();
  const label = isLifetime ? `Buy ${displayName} — one-time` : `Upgrade to ${displayName}`;

  if (isAuthenticated) {
    return (
      <UpgradeButton
        tier={tier}
        className="btn-signal mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-md px-6 text-sm font-semibold text-accent-foreground disabled:opacity-60"
      >
        {label}
      </UpgradeButton>
    );
  }

  // Logged-out visitor — straight to account creation instead of firing
  // the checkout server action, which just bounces off requireUser()'s
  // redirect into the sign-in (not sign-up) mode. A real account must
  // exist before any checkout, paid or free.
  return (
    <TrackedCtaLink
      href="/login?mode=signup"
      eventName="marketing_cta_clicked"
      eventProperties={{ location: "pricing", tier }}
      className="btn-signal mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-md px-6 text-sm font-semibold text-accent-foreground"
    >
      {label}
    </TrackedCtaLink>
  );
}
