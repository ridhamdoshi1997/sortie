// Are two company keys the same employer?
//
// `toCompanyKey` already lowercases and strips non-alphanumerics, so "TD
// Bank" and "td bank!" collapse. What it cannot do is recognise that the
// SAME employer arrives under different names from different sources.
// Measured live on a real "Financial Advisor"/Toronto search: of 18
// employers returned by LinkedIn and Indeed, exactly ONE matched our crawl
// on an exact key.
//
//   aggregator says      our crawl stores
//   -----------------    ----------------------------
//   BMO                  bmocampus, bmoprivileged
//   CIBC                 cibccampus
//   TD                   tdbank
//   BDO Canada           bdo
//   Desjardins Fin. Sec. desjardins
//
// Fuzzy matching is NOT the answer, and the same measurement shows why:
// "Meridian Credit Union" prefix-matches "meridianbioscience", and "Citi"
// matches "ci" and "cit". Those are different companies. A false company
// match would let us tell someone a live job is dead on the strength of an
// unrelated employer's board.
//
// So this strips only a CLOSED LIST of corporate qualifiers from the end of
// a key, and only while something substantial remains. It never guesses.
// "bmocampus" -> "bmo" is a rule about the word "campus", not a similarity
// score.

// Ordered longest-first so "financialservices" is consumed as a unit before
// "services" can nibble at it. Every entry is a word that qualifies an
// employer rather than identifying one.
const QUALIFIERS = [
  "financialservices",
  "wealthmanagement",
  "financialsecurity",
  "privatecapital",
  "international",
  "incorporated",
  "experienced",
  "corporation",
  "investments",
  "privileged",
  "management",
  "technology",
  "insurance",
  "financial",
  "solutions",
  "worldwide",
  "americas",
  "services",
  "security",
  "holdings",
  "campus",
  "careers",
  "company",
  "limited",
  "capital",
  "canada",
  "global",
  "wealth",
  "group",
  "corp",
  "bank",
  "intl",
  "plc",
  "llc",
  "ltd",
  "inc",
  "co",
  "na",
  "us",
  "usa",
  "uk",
  "ca",
];

// Below this, a "company" is an abbreviation that collides with everything
// ("ci", "td", "fi"). Stripping down to 3 characters is allowed only
// because the strip itself is evidence: we removed a real qualifier word,
// we did not guess at a prefix.
const MIN_STEM = 3;

/**
 * Reduce a company key to its identifying stem by removing trailing
 * corporate qualifiers. Idempotent, and returns the input unchanged when
 * nothing matches.
 */
export function canonicalCompanyKey(companyKey: string): string {
  let key = (companyKey || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of QUALIFIERS) {
      if (key.length > q.length + MIN_STEM - 1 && key.endsWith(q)) {
        const stem = key.slice(0, -q.length);
        if (stem.length >= MIN_STEM) {
          key = stem;
          changed = true;
          break;
        }
      }
    }
  }
  return key;
}

export type CompanyMatch = "exact" | "canonical" | "none";

/**
 * How confidently are these the same employer?
 *
 * The caller is expected to treat these differently rather than collapsing
 * them to a boolean — see lib/postingLiveness.ts, which will assert a job
 * is CLOSED only on an `exact` match, because that is the direction where
 * being wrong costs someone an application they should have sent.
 */
export function compareCompanyKeys(a: string, b: string): CompanyMatch {
  const left = (a || "").toLowerCase();
  const right = (b || "").toLowerCase();
  if (!left || !right) return "none";
  if (left === right) return "exact";
  const cl = canonicalCompanyKey(left);
  const cr = canonicalCompanyKey(right);
  if (cl && cr && cl === cr) return "canonical";
  return "none";
}
