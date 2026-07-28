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
  //    from 2026-07-28 onward) a Clearbit URL built from a domain Gemini
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
  // Deliberately NOT in this chain: Google's favicon service. Tried twice
  // (2026-07-28) and reverted both times — it doesn't fail for a domain it
  // doesn't recognize the way Clearbit does, it silently serves its own
  // generic placeholder globe icon with a 200 status, and reliably
  // detecting that client-side requires a cross-origin byte-size check
  // that depends on CORS headers this environment couldn't confirm either
  // way. It made results look worse (misleading generic blobs), not
  // better. Don't re-add it without first confirming, live, that a
  // not-found domain gets a real error rather than a placeholder image.
  //
  // Clearbit requests are routed through /api/logo (this app's own
  // origin), not fetched directly — confirmed live (2026-07-28) that
  // direct <img src="https://logo.clearbit.com/...">  requests were stuck
  // showing the browser's native broken-image glyph with `onError` never
  // firing, even after several rounds of retry/fallback logic here. Most
  // likely an ad-blocker or tracking-protection extension silently
  // blocking a known third-party data company's domain. Proxying through
  // our own origin means the browser never talks to logo.clearbit.com
  // directly, and a real 404 from OUR server fires onError reliably. The
  // real SerpApi thumbnail (when logoUrl is already set) is left direct —
  // it's Google's own image CDN, not a known tracker/data-broker domain,
  // so there's no equivalent evidence it needs the same treatment.
  const candidates = [
    logoUrl,
    domainGuess ? `/api/logo?url=${encodeURIComponent(`https://logo.clearbit.com/${domainGuess}?size=128`)}` : null,
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
