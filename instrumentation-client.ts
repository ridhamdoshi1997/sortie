// Browser-side init — loaded automatically by Next.js (App Router's
// instrumentation-client.ts convention). Runs both PostHog (pre-existing —
// a real regression was caught here 2026-08-19: wiring up Sentry had
// silently replaced this file's original initPostHog() call, disabling
// all client-side PostHog analytics with no error, since posthog-js is a
// no-op until init() runs) and Sentry (inert-until-configured, same guard
// as the server/edge configs).
import * as Sentry from "@sentry/nextjs";
import { initPostHog } from "@/lib/posthog-client";

try {
  initPostHog();
} catch (error) {
  console.error("[instrumentation-client]", error);
}

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

// A prior session removed this, believing captureRouterTransitionStart was
// an invented API — it isn't. It's real, just declared in
// @sentry/nextjs's client-only type entry (build/types/client/index.d.ts),
// which that session's check missed by only grepping the generic
// build/types/index.types.d.ts. Confirmed present in this file's own
// resolved import (`import * as Sentry from "@sentry/nextjs"` resolves to
// the client build here, per Next.js's own instrumentation-client.ts
// convention) before re-adding it.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
