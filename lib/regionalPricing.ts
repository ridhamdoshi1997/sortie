import type { PlanConfig } from "@/lib/subscription";

export type RegionKey = string;

// ISO-3166 alpha-2 -> the regional_prices key it resolves to. A code
// constant, same convention as lib/usage.ts's DAILY_LIMITS (flat,
// code-reviewed, deployed) — deliberately NOT admin-editable. The admin
// already has full live control over the PRICE per region via
// PlansManager.tsx; which countries fall in which band changes rarely and
// should go through a PR, not a live-editable dropdown.
//
// Originally a seed list covering only the Indian subcontinent (2026-08-28).
// Extended to global coverage 2026-09-10 (direct user request). Two kinds of
// region live in this map, and conflating them is the mistake to avoid:
//
//   1. LOCAL-CURRENCY regions (eu/uk/ca/anz) — Europe, the UK, Canada and
//      Australia/NZ are equal-or-higher purchasing power than the US. These
//      exist purely so a visitor sees €14 rather than $15, which converts
//      better. They are NOT discounts, and pricing them below the US number
//      would be giving away revenue in the highest-value markets. Confirmed
//      with the user before writing this.
//   2. PPP BANDS (everything ending _usd) — genuinely price-sensitive
//      markets grouped into shared bands, charged in USD so each band needs
//      one Stripe Price per plan rather than one per country. Same reasoning
//      that put Pakistan/Sri Lanka/Bangladesh in a single band originally.
//
// ADDING A REGION HERE COSTS NOTHING. An unconfigured region (blank price in
// the admin editor) falls through to the base USD price exactly as an
// unmapped country does — so these rows simply sit ready in
// PlansManager.tsx's RegionalPricingEditor until someone sets real numbers.
// The cost is per CONFIGURED region: 3 paid plans x 1 Stripe Price each.
//
// Still deliberately a code constant, not admin-editable: WHICH countries
// fall in which band changes rarely and should go through a PR. The PRICE
// per band is fully admin-controlled, which is the part that actually moves.
export const COUNTRY_REGION_KEY: Record<string, RegionKey> = {
  // --- Local currency, same value (not discounts) ---
  // Eurozone
  AT: "eu", BE: "eu", HR: "eu", CY: "eu", EE: "eu", FI: "eu", FR: "eu",
  DE: "eu", GR: "eu", IE: "eu", IT: "eu", LV: "eu", LT: "eu", LU: "eu",
  MT: "eu", NL: "eu", PT: "eu", SK: "eu", SI: "eu", ES: "eu",
  GB: "uk",
  CA: "ca",
  AU: "anz", NZ: "anz",

  // --- PPP bands (USD) ---
  IN: "in",
  PK: "south_asia_usd", LK: "south_asia_usd", BD: "south_asia_usd", NP: "south_asia_usd",
  ID: "sea_usd", PH: "sea_usd", VN: "sea_usd", TH: "sea_usd", MY: "sea_usd",
  BR: "latam_usd", MX: "latam_usd", AR: "latam_usd", CO: "latam_usd",
  CL: "latam_usd", PE: "latam_usd",
  NG: "africa_usd", KE: "africa_usd", ZA: "africa_usd", GH: "africa_usd", EG: "africa_usd",
  UA: "eastern_europe_usd", RO: "eastern_europe_usd", BG: "eastern_europe_usd",
  RS: "eastern_europe_usd", PL: "eastern_europe_usd", TR: "eastern_europe_usd",
};

// Human-readable label per region key, for the admin editor
// (PlansManager.tsx's RegionalPricingEditor) — derived by hand from
// COUNTRY_REGION_KEY's grouping rather than programmatically, since a
// shared region key (e.g. south_asia_usd covering several countries) needs
// one combined label, not a mechanical join of country codes.
//
// This object's key order is also the ROW ORDER in the admin editor
// (REGION_KEYS = Object.keys(REGION_LABELS)), so local-currency regions are
// listed first and the discount bands after — matching how they should be
// reasoned about, not alphabetically.
export const REGION_LABELS: Record<RegionKey, string> = {
  eu: "Eurozone (EUR) — local currency, not a discount",
  uk: "United Kingdom (GBP) — local currency, not a discount",
  ca: "Canada (CAD) — local currency, not a discount",
  anz: "Australia / New Zealand (AUD) — local currency, not a discount",
  in: "India (INR)",
  south_asia_usd: "Pakistan / Sri Lanka / Bangladesh / Nepal (USD)",
  sea_usd: "Southeast Asia — ID / PH / VN / TH / MY (USD)",
  latam_usd: "Latin America — BR / MX / AR / CO / CL / PE (USD)",
  africa_usd: "Africa — NG / KE / ZA / GH / EG (USD)",
  eastern_europe_usd: "Eastern Europe / Türkiye — UA / RO / BG / RS / PL / TR (USD)",
};

// The currency a region is charged in, used to pre-fill the admin editor so
// a Eurozone row does not silently default to USD. Lives here beside the
// region map rather than in the component, so adding a region is still a
// one-file change.
export const REGION_DEFAULT_CURRENCY: Record<RegionKey, string> = {
  eu: "eur",
  uk: "gbp",
  ca: "cad",
  anz: "aud",
  in: "inr",
};

export function defaultCurrencyForRegion(region: RegionKey): string {
  return REGION_DEFAULT_CURRENCY[region] ?? "usd";
}

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
