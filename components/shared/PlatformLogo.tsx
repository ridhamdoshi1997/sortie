"use client";

import { useState } from "react";

// Real platform logos, not hand-drawn approximations — routed through this
// app's own /api/logo proxy (app/api/logo/route.ts), same mechanism
// CompanyLogo.tsx uses for company logos, just a different, explicitly
// allowlisted upstream per platform. LinkedIn already has a hand-authored,
// currentColor vector glyph in production use elsewhere in this app
// (LinkedInGlyph.tsx, ConnectedAccounts/CompanyResearch/InsiderConnections)
// — kept as-is rather than switched to a fetched image, since it's already
// proven, AND unavatar.io (this app's usual logo upstream) returns a real,
// reproducible 429 for linkedin.com when fetched (confirmed live). Indeed
// has no existing asset — unavatar.io also 429s for indeed.com specifically
// (confirmed live, not a one-off: retried after a delay, still 429) — so
// this fetches Indeed's own favicon.ico directly instead, which returns a
// normal 200 with no such block.
const PLATFORM_LOGO_URLS: Record<string, string> = {
  indeed: "https://www.indeed.com/favicon.ico",
};

export function PlatformLogo({ source, className }: { source: string; className?: string }) {
  const logoUrl = PLATFORM_LOGO_URLS[source];
  const [errored, setErrored] = useState(false);

  if (!logoUrl || errored) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-domain source, same as CompanyLogo.tsx
    <img
      src={`/api/logo?url=${encodeURIComponent(logoUrl)}`}
      alt=""
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setErrored(true)}
    />
  );
}
