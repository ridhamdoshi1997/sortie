// Which country's job index to search, derived from what the candidate typed.
//
// Every search was hard-coded to "ca" (lib/actions/scraper.actions.ts). That was
// invisible while this was a Canada-only product, but it is a live bug the
// moment anyone searches elsewhere: Indeed's actor takes a country enum, so a
// "New York, NY" search was querying Indeed's CANADIAN index and returning
// whatever Canadian rows loosely matched.
//
// Indeed's actor accepts US, UK, CA, AU, IN, DE, FR. LinkedIn's takes a free
// location string and needs no country at all, so it already works anywhere --
// this only decides Indeed's index.
//
// Deliberately NOT a geocoding API: that is a paid dependency and a network
// call on the search path, to answer a question a lookup table answers for the
// markets this product actually targets. Unrecognised input falls back rather
// than guessing.

export type SupportedCountry = "US" | "UK" | "CA" | "AU" | "IN" | "DE" | "FR";

// Ordered most- to least-specific: an explicit country name wins over a
// province code, which wins over a city, so "London, Ontario" resolves to CA
// rather than the UK -- a real ambiguity in this data set.
const COUNTRY_NAMES: [RegExp, SupportedCountry][] = [
  [/\b(canada|canadian)\b/i, "CA"],
  [/\b(united states|u\.?s\.?a?\.?)\b/i, "US"],
  [/\b(united kingdom|great britain|england|scotland|wales|u\.?k\.?)\b/i, "UK"],
  [/\b(australia|new zealand)\b/i, "AU"],
  [/\b(india|bharat)\b/i, "IN"],
  [/\b(germany|deutschland)\b/i, "DE"],
  [/\b(france)\b/i, "FR"],
];

// Sub-national codes, matched only as a trailing or comma-delimited token so
// "ON" does not fire inside "Ontario Street" or the word "on".
const CA_PROVINCES = /(^|[,\s])(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)([,\s]|$)/;
const US_STATES =
  /(^|[,\s])(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)([,\s]|$)/;

// Spelled-out sub-national names, checked BEFORE cities because city names
// collide across countries and region names do not. "London, Ontario" is the
// case that proves it: without this it matched the UK city list and sent a
// Canadian search to Indeed's UK index.
const REGION_NAMES: [RegExp, SupportedCountry][] = [
  [/\b(ontario|quebec|qu[eé]bec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island)\b/i, "CA"],
  [/\b(california|texas|florida|illinois|pennsylvania|ohio|georgia|michigan|virginia|washington|arizona|massachusetts|colorado|oregon|new jersey|north carolina)\b/i, "US"],
  [/\b(new south wales|queensland|western australia|tasmania)\b/i, "AU"],
  [/\b(maharashtra|karnataka|tamil nadu|telangana|gujarat|haryana|uttar pradesh|west bengal)\b/i, "IN"],
];

const CITIES: [RegExp, SupportedCountry][] = [
  [/\b(toronto|montr[eé]al|vancouver|calgary|ottawa|edmonton|winnipeg|halifax|mississauga|brampton|hamilton|kitchener|waterloo|windsor|regina|saskatoon|burnaby|markham|vaughan|laval|gatineau|quebec city)\b/i, "CA"],
  [/\b(new york|nyc|san francisco|los angeles|chicago|boston|seattle|austin|denver|atlanta|dallas|houston|miami|philadelphia|phoenix|san diego|san jose|washington dc|portland|detroit|minneapolis)\b/i, "US"],
  [/\b(london|manchester|birmingham|edinburgh|glasgow|bristol|leeds|liverpool|cardiff|belfast)\b/i, "UK"],
  [/\b(sydney|melbourne|brisbane|perth|adelaide|canberra|auckland|wellington)\b/i, "AU"],
  [/\b(mumbai|bombay|delhi|new delhi|gurgaon|gurugram|noida|bangalore|bengaluru|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur)\b/i, "IN"],
  [/\b(berlin|munich|m[uü]nchen|hamburg|frankfurt|cologne|k[oö]ln|stuttgart|d[uü]sseldorf)\b/i, "DE"],
  [/\b(paris|lyon|marseille|toulouse|bordeaux|lille|nantes)\b/i, "FR"],
];

/**
 * Resolves the search country from a location string.
 *
 * `fallback` is what to use when nothing matches -- pass the candidate's own
 * profile country where one is known, so an unrecognised city searched by a US
 * user does not silently query Canada.
 */
export function resolveSearchCountry(
  location: string | null | undefined,
  fallback: SupportedCountry = "CA",
): SupportedCountry {
  const value = (location ?? "").trim();
  if (!value) return fallback;

  for (const [pattern, country] of COUNTRY_NAMES) {
    if (pattern.test(value)) return country;
  }

  for (const [pattern, country] of REGION_NAMES) {
    if (pattern.test(value)) return country;
  }

  const upper = value.toUpperCase();
  // Province before state: CA/ON/etc. overlap with US state codes, and this
  // product's existing users are Canadian, so the ambiguous case stays CA.
  if (CA_PROVINCES.test(upper)) return "CA";
  if (US_STATES.test(upper)) return "US";

  for (const [pattern, country] of CITIES) {
    if (pattern.test(value)) return country;
  }

  return fallback;
}

// English-titled markets, where the O*NET occupation taxonomy
// (lib/occupationMatch.ts) resolves real posting titles. DE and FR are
// deliberately absent: their postings are titled in German and French, which
// O*NET does not contain, so those searches fall through to word matching until
// ESCO (the European Commission's free multilingual equivalent) is imported.
export const OCCUPATION_TAXONOMY_MARKETS: SupportedCountry[] = ["US", "UK", "CA", "AU", "IN"];

export function hasOccupationTaxonomy(country: SupportedCountry): boolean {
  return OCCUPATION_TAXONOMY_MARKETS.includes(country);
}
