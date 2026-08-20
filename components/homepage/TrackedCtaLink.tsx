"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { trackPostHogClientEvent } from "@/lib/posthog-client";

// Conversion tracking on the marketing homepage's CTAs (build-plan.md §S
// fast-follow) — a small Client Component boundary so Hero.tsx/CTASection.tsx
// can stay Server Components (an inline onClick can't cross that boundary).
export function TrackedCtaLink({
  href,
  eventName,
  eventProperties,
  className,
  children,
}: {
  href: string;
  eventName: string;
  eventProperties?: Record<string, unknown>;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackPostHogClientEvent(eventName, eventProperties)}
    >
      {children}
    </Link>
  );
}
