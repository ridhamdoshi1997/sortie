import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// SEO redirects (admin console expansion item 3, context/RESUME.md) —
// deliberately a plain static array here, not a DB-backed `pages`/redirect
// table checked on every request. Confirmed via research this is the
// right tradeoff at this app's scale: a redirect gets added a few times a
// month at most, so the latency of a Postgres lookup on every single
// request isn't worth it — a 2-minute edit + redeploy is cheaper than that
// architecture. Add a new entry here (source/destination/permanent) and
// redeploy whenever a route gets renamed or removed; don't build an admin
// UI for this.
const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Renamed 2026-08-xx: "Pipeline" -> "Missions" (route + all
      // components), per progress-tracker.md.
      { source: "/pipeline", destination: "/missions", permanent: true },
      { source: "/pipeline/:path*", destination: "/missions/:path*", permanent: true },
      // Removed: the dedicated /agent page was deleted when Navigator
      // became floating-only everywhere — no direct 1:1 replacement page,
      // so old links land on the authenticated home instead of 404ing.
      { source: "/agent", destination: "/dashboard", permanent: true },
    ];
  },
};

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
  // disableLogger was here but is deprecated in favor of
  // webpack.treeshake.removeDebugLogging — which itself only works under
  // webpack, not Turbopack (this project's actual dev/build bundler, see
  // "next dev"/"next build" both running with Turbopack). No real
  // replacement applies here, so this option is just removed rather than
  // swapped for one that silently wouldn't do anything.
});
