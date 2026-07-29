"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";

// Best-effort domain guess from the company name (strip legal suffixes,
// lowercase, drop punctuation/spaces) — a client-side safety net for jobs
// whose row doesn't have a resolved company_logo_url yet (see the comment
// below on why that's most of the existing catalog right now). Wrong
// guesses simply 404 and this component falls through to the next
// candidate, so a bad guess never shows a wrong/fabricated logo — worst
// case it shows nothing, same as before this existed.
function guessCompanyDomain(company: string): string | null {
  const cleaned = company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
  return cleaned ? `${cleaned}.com` : null;
}

const sizeClasses = {
  md: { box: "h-14 w-14 rounded-xl", icon: "h-7 w-7", padding: "p-1.5" },
  lg: { box: "h-20 w-20 rounded-2xl", icon: "h-9 w-9", padding: "p-2" },
} as const;

type Props = {
  company: string | null;
  logoUrl: string | null;
  size?: keyof typeof sizeClasses;
};

export function CompanyLogo({ company, logoUrl, size = "md" }: Props) {
  const domainGuess = company ? guessCompanyDomain(company) : null;
  // Two real sources, in order of trust:
  // 1. logoUrl — either a real SerpApi thumbnail, or (for jobs evaluated
  //    from 2026-07-28 onward) a logo URL built from a domain Gemini
  //    actually resolved from its own knowledge of the company (see
  //    companyDomain's comment in lib/evaluator.ts) — fixes cases a naive
  //    guess gets wrong, e.g. Bank of Montreal -> bmo.com not
  //    bankofmontreal.com.
  // 2. A client-side naive domain guess — covers every job evaluated
  //    BEFORE that server-side resolution existed (i.e. most of the
  //    existing catalog right now; it isn't retroactively backfilled) and
  //    any job whose evaluator run didn't confidently resolve a domain.
  //    Removing this tier entirely was tried (2026-07-28) and reverted the
  //    same day — confirmed live it regressed real, previously-working
  //    logos (Scotiabank, Moneris, and others) back to the icon fallback,
  //    since those were only ever showing via this client-side guess, not
  //    a persisted DB value. Keep both tiers.
  //
  // UPDATE 2026-07-28 (later same day): source swapped from Clearbit to
  // unavatar.io. Clearbit's Logo API turned out to be fully DNS-dead, not
  // ad-blocker-blocked as originally guessed — confirmed live. unavatar.io
  // was confirmed live to behave the way Clearbit used to (real domain ->
  // real image, unresolvable domain + `fallback=false` -> a real error
  // status, not a silent placeholder). Google's favicon service is still
  // deliberately NOT in this chain — tried twice and reverted both times
  // because it always returns 200 with a generic globe placeholder for an
  // unrecognized domain, which read as worse than the icon fallback.
  //
  // Domain-guess requests are routed through /api/logo (this app's own
  // origin), not fetched directly, so a real error from OUR server fires
  // onError reliably regardless of the upstream's own failure mode. The
  // real SerpApi thumbnail (when logoUrl is already set) is left direct —
  // it's Google's own image CDN, unaffected by any of this.
  const candidates = [
    logoUrl,
    domainGuess ? `/api/logo?url=${encodeURIComponent(`https://unavatar.io/${domainGuess}?fallback=false`)}` : null,
  ].filter((url): url is string => Boolean(url));

  const [candidateIndex, setCandidateIndex] = useState(0);
  const { box, icon, padding } = sizeClasses[size];
  const src = candidates[candidateIndex];

  if (!src) {
    return (
      <div className={`flex ${box} flex-shrink-0 items-center justify-center border border-border bg-surface-secondary`}>
        <Building2 className={`${icon} text-text-muted`} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-domain source; next/image's remote-pattern allowlist doesn't fit a runtime-variable host.
    <img
      key={src}
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className={`${box} flex-shrink-0 border border-border bg-surface-secondary object-contain ${padding}`}
      onError={() => setCandidateIndex((i) => i + 1)}
    />
  );
}
