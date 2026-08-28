import type { PlanConfig } from "@/lib/subscription";

export type RegionKey = string;

// ISO-3166 alpha-2 -> the regional_prices key it resolves to. A code
// constant, same convention as lib/usage.ts's DAILY_LIMITS (flat,
// code-reviewed, deployed) — deliberately NOT admin-editable. The admin
// already has full live control over the PRICE per region via
// PlansManager.tsx; which countries fall in which band changes rarely and
// should go through a PR, not a live-editable dropdown.
//
// Seed list only (direct user request, 2026-08-28, emphasis on the Indian
// subcontinent given population/price-sensitivity) — India gets its own
// region since it's the single biggest market; Pakistan/Sri Lanka/
// Bangladesh share one band for now since a real Stripe Price hasn't been
// created for each individually yet. Extend this map as more regions are
// prioritized; every unmapped country falls through to the base US price,
// nothing breaks by omission.
export const COUNTRY_REGION_KEY: Record<string, RegionKey> = {
  IN: "in",
  PK: "south_asia_usd",
  LK: "south_asia_usd",
  BD: "south_asia_usd",
};

// Human-readable label per region key, for the admin editor
// (PlansManager.tsx's RegionalPricingEditor) — derived by hand from
// COUNTRY_REGION_KEY's grouping rather than programmatically, since a
// shared region key (e.g. south_asia_usd covering 3 countries) needs one
// combined label, not a mechanical join of country codes.
export const REGION_LABELS: Record<RegionKey, string> = {
  in: "India (INR)",
  south_asia_usd: "Pakistan / Sri Lanka / Bangladesh (USD)",
};

export function regionKeyForCountry(countryCode: string | null): RegionKey | null {
  if (!countryCode) return null;
  return COUNTRY_REGION_KEY[countryCode.toUpperCase()] ?? null;
}

// The Stripe Price actually charged at checkout. Real bug caught before
// this ever shipped: falling back to the base US Price whenever a
// region's stripePriceId is blank would silently charge a DIFFERENT price
// than the one just displayed to the visitor the moment an admin sets a
// display-only regional price ahead of creating its real Stripe Price — a
// genuine bait-and-switch, not just a cosmetic gap. So the fallback to the
// base price only applies when NO override exists for this region at all
// (unmapped country, or a region the admin hasn't touched yet); once an
// override DOES exist, its own stripePriceId is authoritative — null means
// checkout is correctly blocked for that plan+region until a real Price is
// created and pasted in, never a silent substitution.
export function resolveStripePriceId(plan: PlanConfig, regionKey: RegionKey | null): string | null {
  if (!regionKey) return plan.stripePriceId;
  const override = plan.regionalPrices[regionKey];
  if (override === undefined) return plan.stripePriceId;
  return override.stripePriceId;
}

// The price/currency shown on /pricing, the homepage, and Settings — same
// fallback rule as resolveStripePriceId, kept as its own function since
// display doesn't need a real Stripe Price ID to exist yet (an admin can
// set a display price to preview before creating the actual Stripe Price).
export function resolveDisplayPrice(plan: PlanConfig, regionKey: RegionKey | null): { priceCents: number; currency: string } {
  const override = regionKey ? plan.regionalPrices[regionKey] : undefined;
  if (override) return { priceCents: override.priceCents, currency: override.currency };
  return { priceCents: plan.priceCents, currency: "usd" };
}

// Real locale-correct currency formatting (₹749, not "749 INR" or a bare
// "$" prefix on a non-USD amount) — Intl.NumberFormat picks the right
// symbol/placement per currency automatically. priceCents follows the same
// "smallest currency unit" convention Stripe itself uses (paise for INR,
// cents for USD), matching how this column's existing base price_cents is
// already interpreted everywhere else in this codebase.
export function formatPriceCents(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}
