// Server-side (Node.js runtime) Sentry init. Inert until SENTRY_DSN is set —
// deliberately guarded rather than passing an empty string to Sentry.init,
// so a fresh clone with no DSN configured never even attempts to reach
// Sentry's ingest endpoint, no console noise either way.
import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Never send request bodies/headers — this app's routes handle real
    // user documents/PII (résumés, profile data); Sentry only needs the
    // error, not the payload that triggered it.
    sendDefaultPii: false,
  });
}
