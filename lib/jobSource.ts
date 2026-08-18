// Where a job row actually came from — surfaced as a small badge on
// JobResultCard/KanbanCard so extension-captured jobs (LinkedIn/Indeed) and
// manually-pasted ones are visually distinguishable from the default
// SerpApi-scraped majority, and from each other. See lib/externalJob.ts.
//
// Brand-colored per ui-tokens.md's "Source Badges" section and its
// Invariant ("LinkedIn badge always uses --linkedin — never generic blue")
// — --color-indeed added alongside --color-linkedin the same session this
// filter/badge pair shipped (2026-08-18), same token shape (base/light/
// foreground + a dark-mode override for the light tier).
export type SourceBadge = {
  label: string;
  badgeClassName: string;
};

// 8 more platforms added 2026-08-18 (v1.5, same session) — deliberately
// scoped to a single neutral badge style, not per-platform brand research.
// LinkedIn/Indeed got real confirmed brand colors + real logos because that
// was explicitly asked for; doing the same for 8 more sites (a real hex
// code + a working logo fetch, confirmed live, per site) is a meaningfully
// bigger task than adding capture support itself and wasn't part of this
// pass — a reasonable fast-follow if any of these turn out to be
// heavily used.
const NEUTRAL_PLATFORM_LABELS: Record<string, string> = {
  simplyhired: "SimplyHired",
  dice: "Dice",
  careerbuilder: "CareerBuilder",
  remoteok: "RemoteOK",
  monster: "Monster",
  weworkremotely: "We Work Remotely",
  builtin: "Built In",
  ziprecruiter: "ZipRecruiter",
};

export function getSourceBadge(source: string | null | undefined): SourceBadge | null {
  switch (source) {
    case "linkedin":
      return { label: "via LinkedIn", badgeClassName: "bg-linkedin-light text-linkedin" };
    case "indeed":
      return { label: "via Indeed", badgeClassName: "bg-indeed-light text-indeed" };
    case "url":
      return { label: "Pasted", badgeClassName: "bg-surface-secondary text-text-secondary" };
    default: {
      const label = source ? NEUTRAL_PLATFORM_LABELS[source] : undefined;
      if (!label) return null; // "SerpApi" (the default/majority case) and anything unrecognized
      return { label: `via ${label}`, badgeClassName: "bg-surface-secondary text-text-secondary" };
    }
  }
}

// Missions' source filter (MissionsFilterBar.tsx) — plain labels, not the
// "via X"/"Pasted" badge copy above, since this reads as a filter option
// ("Source: LinkedIn"), not an inline annotation on a card.
export const SOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  ...Object.entries(NEUTRAL_PLATFORM_LABELS).map(([value, label]) => ({ value, label })),
  { value: "url", label: "Pasted" },
  { value: "SerpApi", label: "Scraped" },
];
