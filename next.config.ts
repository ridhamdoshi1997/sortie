import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

// withSentryConfig itself is safe to apply even with no Sentry project
// configured yet — it only skips source-map upload (with a warning, not a
// build failure) when SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN aren't
// set, same as error reporting itself staying inert without SENTRY_DSN
// (see sentry.server.config.ts/instrumentation-client.ts).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
