// Equity & Cap Table Decoder — rescoped from a funding-data lookup (would
// need Crunchbase, no free tier — see context/build-plan.md §M) to a pure
// calculator on numbers the candidate types in themselves. No AI call, no
// external data, no fabricated growth projection: every number here is
// either user input or arithmetic on user input, computed today's-value
// only. Mirrors the offer_details/offer_details_updated_at column shape.

export type EquityType = "rsu" | "iso" | "nso" | "none";

export type OfferDetails = {
  baseSalary: number | null;
  signingBonus: number | null;
  annualBonusTarget: number | null;
  equityType: EquityType;
  numberOfShares: number | null;
  strikePrice: number | null; // options only
  currentFmv: number | null; // current fair-market/409A value per share
  totalSharesOutstanding: number | null; // optional, for ownership %
  vestingYears: number | null;
  cliffMonths: number | null;
};

export const EMPTY_OFFER_DETAILS: OfferDetails = {
  baseSalary: null,
  signingBonus: null,
  annualBonusTarget: null,
  equityType: "none",
  numberOfShares: null,
  strikePrice: null,
  currentFmv: null,
  totalSharesOutstanding: null,
  vestingYears: null,
  cliffMonths: null,
};

export type EquityDecoderResult = {
  // Value of the full grant at today's FMV — for RSUs this is the grant's
  // face value; for options this is intrinsic value before subtracting cost.
  grantValueAtFmv: number | null;
  // Options only: cash required to exercise the full grant.
  exerciseCost: number | null;
  // Options only: grantValueAtFmv - exerciseCost. Negative means underwater
  // at today's FMV (strike price above current value).
  spreadAtFmv: number | null;
  isUnderwater: boolean | null;
  ownershipPercent: number | null;
  // Shares that vest in year 1, accounting for a cliff (0 before the cliff
  // passes 12 months, otherwise the standard first-year tranche).
  year1VestedShares: number | null;
  year1VestedValue: number | null; // at today's FMV, options net of exercise cost
  annualVestedShares: number | null; // grant / vestingYears, for years after year 1
  totalComp: {
    year1: number | null; // base + signing bonus + year1 equity value
    steadyState: number | null; // base + target bonus + one year's equity vesting
  };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CURRENCY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCurrency(n: number | null): string {
  if (n === null) return "—";
  return CURRENCY_FORMAT.format(n);
}

export function decodeOffer(details: OfferDetails): EquityDecoderResult {
  const { equityType, numberOfShares, strikePrice, currentFmv, totalSharesOutstanding, vestingYears, cliffMonths } =
    details;

  const hasEquity = equityType !== "none" && numberOfShares !== null && numberOfShares > 0;
  const isOption = equityType === "iso" || equityType === "nso";

  let grantValueAtFmv: number | null = null;
  let exerciseCost: number | null = null;
  let spreadAtFmv: number | null = null;
  let isUnderwater: boolean | null = null;

  if (hasEquity && currentFmv !== null) {
    grantValueAtFmv = round2(numberOfShares * currentFmv);

    if (isOption && strikePrice !== null) {
      exerciseCost = round2(numberOfShares * strikePrice);
      spreadAtFmv = round2(grantValueAtFmv - exerciseCost);
      isUnderwater = spreadAtFmv < 0;
    }
  }

  const ownershipPercent =
    hasEquity && totalSharesOutstanding !== null && totalSharesOutstanding > 0
      ? round2((numberOfShares / totalSharesOutstanding) * 100)
      : null;

  const years = vestingYears && vestingYears > 0 ? vestingYears : null;
  const annualVestedShares = hasEquity && years !== null ? Math.round(numberOfShares / years) : null;

  const cliffPassed = (cliffMonths ?? 0) <= 12;
  const year1VestedShares = annualVestedShares !== null ? (cliffPassed ? annualVestedShares : 0) : null;

  const perShareValueAfterCost = currentFmv !== null ? currentFmv - (isOption ? (strikePrice ?? 0) : 0) : null;
  const year1VestedValue =
    year1VestedShares !== null && perShareValueAfterCost !== null
      ? round2(year1VestedShares * Math.max(0, perShareValueAfterCost))
      : null;
  const annualVestedValue =
    annualVestedShares !== null && perShareValueAfterCost !== null
      ? round2(annualVestedShares * Math.max(0, perShareValueAfterCost))
      : null;

  const base = details.baseSalary ?? 0;
  const signing = details.signingBonus ?? 0;
  const targetBonus = details.annualBonusTarget ?? 0;

  const hasAnyCashInput = details.baseSalary !== null;
  const totalComp = {
    year1: hasAnyCashInput ? round2(base + signing + (year1VestedValue ?? 0)) : null,
    steadyState: hasAnyCashInput ? round2(base + targetBonus + (annualVestedValue ?? 0)) : null,
  };

  return {
    grantValueAtFmv,
    exerciseCost,
    spreadAtFmv,
    isUnderwater,
    ownershipPercent,
    year1VestedShares,
    year1VestedValue,
    annualVestedShares,
    totalComp,
  };
}
