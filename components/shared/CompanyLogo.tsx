"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";

import { extractLikelyLogoDomain } from "@/lib/applyLinkTrust";

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
  sm: { box: "h-9 w-9 rounded-lg", icon: "h-4.5 w-4.5", padding: "p-1", initial: "text-xs" },
  md: { box: "h-14 w-14 rounded-xl", icon: "h-7 w-7", padding: "p-1.5", initial: "text-lg" },
  lg: { box: "h-20 w-20 rounded-2xl", icon: "h-9 w-9", padding: "p-2", initial: "text-2xl" },
} as const;

// A designed placeholder, instead of the same grey building icon on every
// unresolvable employer (2026-09-09).
//
// Logo coverage tops out around 80-85%: the misses are staffing agencies,
// numbered companies and single-location businesses that no service resolves,
// because there is nothing on the public web to resolve to. The question is
// therefore not how to reach 100% real logos -- it is what the remainder should
// look like. One repeated icon reads as "failed to load", and twenty of them in
// a list are indistinguishable from each other.
//
// An initial on a colour derived from the name reads as intentional, and gives
// each employer a mark you can scan past. Deterministic, so a company always
// gets the same colour across sessions and devices.
//
// Palette is drawn from the app's own semantic tokens rather than invented
// hues, so tiles sit inside the existing design language. Amber (--color-accent)
// is deliberately absent: it is reserved for user actions, and teal
// (--color-agent) for AI content -- a placeholder is neither.
const TILE_TINTS = [
  "bg-info-light text-info-dark",
  "bg-success-light text-success-dark",
  "bg-surface-tertiary text-text-dark",
  "bg-info-lightest text-info-medium",
  "bg-success-lightest text-success-darker",
  "bg-surface-muted text-text-darker",
] as const;

/** Stable across sessions: same name always yields the same tint. */
function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TILE_TINTS[Math.abs(hash) % TILE_TINTS.length];
}

// Two letters where the name has two real words ("Royal Bank" -> RB), one
// otherwise. Skips leading articles and anything non-alphanumeric so
// "The Co-operators" reads as "C", not "T".
function initialsFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !["the", "a", "an", "of", "and"].includes(w.toLowerCase()));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

type Props = {
  company: string | null;
  logoUrl: string | null;
  applyUrl?: string | null;
  size?: keyof typeof sizeClasses;
};

export function CompanyLogo({ company, logoUrl, applyUrl, size = "md" }: Props) {
  // Real domain from the job's own trust-classified apply link (see
  // extractLikelyLogoDomain's comment) beats a guess from the company NAME
  // string — the actual root cause of most missing/wrong logos, confirmed
  // live 2026-08-27: "Royal Bank of Canada" naively guesses
  // royalbankofcanada.com (wrong; real domain is rbc.com), but that job's
  // own apply link already resolved to the real jobs.rbc.com.
  const applyUrlDomain = extractLikelyLogoDomain(applyUrl, company);
  const domainGuess = applyUrlDomain ?? (company ? guessCompanyDomain(company) : null);
  // Three real sources, in order of trust:
  // 1. logoUrl — either a real SerpApi thumbnail, or (for jobs evaluated
  //    from 2026-07-28 onward) a logo URL built from a domain Gemini
  //    actually resolved from its own knowledge of the company (see
  //    companyDomain's comment in lib/evaluator.ts) — fixes cases a naive
  //    guess gets wrong, e.g. Bank of Montreal -> bmo.com not
  //    bankofmontreal.com.
  // 2. The job's own apply-link domain (extractLikelyLogoDomain) — real,
  //    verified, not a guess at all, but only available when a caller
  //    passes applyUrl and this job's link classified as "employer".
  // 3. A client-side naive domain guess from the company name — covers
  //    every job evaluated BEFORE server-side resolution existed and any
  //    job whose evaluator run didn't confidently resolve a domain.
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
  // Third tier added 2026-09-05: unavatar 404s for most real employer domains
  // (scotiabank.com, deloitte.ca, kpmg.ca, pwc.com, cibc.com, bmo.com all
  // measured 404; tdbank.com 200), so the chain used to end at the building
  // icon for exactly the large employers a candidate is most likely to be
  // looking at. DuckDuckGo serves all of those and still 404s for a domain
  // that does not exist, so onError keeps working and a bad guess still falls
  // through to the icon rather than showing something wrong.
  const candidates = [
    logoUrl,
    domainGuess ? `/api/logo?url=${encodeURIComponent(`https://unavatar.io/${domainGuess}?fallback=false`)}` : null,
    domainGuess ? `/api/logo?url=${encodeURIComponent(`https://icons.duckduckgo.com/ip3/${domainGuess}.ico`)}` : null,
  ].filter((url): url is string => Boolean(url));

  const [candidateIndex, setCandidateIndex] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const advance = useCallback(() => setCandidateIndex((i) => i + 1), []);

  // Catches an image that already failed BEFORE React hydrated.
  //
  // This is why so many cards showed an empty grey box rather than any
  // fallback (2026-09-09). The server renders the img, the browser requests it
  // immediately, and for a wrong domain it 404s within milliseconds -- often
  // before hydration attaches React's onError. The error event has already
  // fired and gone by the time anything is listening, so candidateIndex never
  // advances, the chain never reaches DuckDuckGo, and the tile never renders.
  // The logo was not missing; the fallback was unreachable.
  //
  // A loaded-but-broken image is unambiguous: complete with naturalWidth 0.
  // Checked per candidate, since each one is a fresh element (key={src}).
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) advance();
  }, [candidateIndex, advance]);

  const { box, padding, initial } = sizeClasses[size];
  const src = candidates[candidateIndex];

  if (!src) {
    const name = (company ?? "").trim();
    if (!name) {
      return (
        <div className={`flex ${box} flex-shrink-0 items-center justify-center border border-border bg-surface-secondary`}>
          <Building2 className={`${sizeClasses[size].icon} text-text-muted`} />
        </div>
      );
    }
    return (
      <div
        aria-hidden="true"
        className={`flex ${box} ${tintFor(name)} flex-shrink-0 select-none items-center justify-center border border-border-light font-semibold tracking-tight ${initial}`}
      >
        {initialsFor(name)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-domain source; next/image's remote-pattern allowlist doesn't fit a runtime-variable host.
    <img
      key={src}
      ref={imgRef}
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className={`${box} flex-shrink-0 border border-border bg-surface-secondary object-contain ${padding}`}
      onError={advance}
    />
  );
}
