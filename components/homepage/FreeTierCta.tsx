"use client";

import { TrackedCtaLink } from "@/components/homepage/TrackedCtaLink";
import { useAuthState } from "@/components/auth/AuthStateProvider";

// Split out of CTASection.tsx so that component can stop calling
// getCurrentUser() server-side (see its own comment) — this is the one
// piece of the Free-tier card that actually varies by auth state.
export function FreeTierCta() {
  const isAuthenticated = useAuthState();

  return (
    <TrackedCtaLink
      href={isAuthenticated ? "/dashboard" : "/login?mode=signup"}
      eventName="marketing_cta_clicked"
      eventProperties={{ location: "pricing" }}
      className="btn-signal mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-md px-6 text-sm font-semibold text-accent-foreground"
    >
      {isAuthenticated ? "Go to dashboard" : "Start for free"}
    </TrackedCtaLink>
  );
}
