// Browser-side Sentry init — loaded automatically by Next.js (App Router's
// instrumentation-client.ts convention), same inert-until-configured guard
// as the server/edge configs.
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
