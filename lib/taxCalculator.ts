// Salary Tax & Take-Home Calculator — US and Canada. Same "pure calculator,
// no fabricated precision" spirit as lib/equityDecoder.ts: every number here
// is either user input or arithmetic on published federal/state/provincial
// income tax brackets, standard deduction / basic personal amount, and
// statutory payroll tax rates (FICA / CPP+EI). No AI call, no live tax-API
// lookup.
//
// Deliberately scoped down, same MVP spirit as the rest of context/build-
// plan.md §M: SINGLE FILER (US) / no spousal credits (Canada) only — no
// married-filing-jointly brackets, no dependents, no itemized deductions or
// credits beyond the standard deduction / basic personal amount, no state
// married brackets, no AMT modeling for ISO exercises, no Quebec federal
// abatement. Bracket thresholds reflect recently published rates and will
// drift from the exact current-year figures over time — this is an
// estimate for comparing offers, not a filing tool. Every UI surface using
// this must say so explicitly, not just this comment.

export type TaxCountry = "us" | "ca";

export type TaxBracket = { upTo: number | null; rate: number };

function progressiveTax(income: number, brackets: TaxBracket[]): number {
  if (income <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of brackets) {
    const upper = upTo ?? Infinity;
    if (income <= lower) break;
    const taxableAtThisRate = Math.min(income, upper) - lower;
    tax += taxableAtThisRate * rate;
    lower = upper;
    if (income <= upper) break;
  }
  return tax;
}

// ---------------------------------------------------------------------------
// United States
// ---------------------------------------------------------------------------

export type USState =
  | "AL" | "AK" | "AZ" | "AR" | "CA" | "CO" | "CT" | "DE" | "DC" | "FL"
  | "GA" | "HI" | "ID" | "IL" | "IN" | "IA" | "KS" | "KY" | "LA" | "ME"
  | "MD" | "MA" | "MI" | "MN" | "MS" | "MO" | "MT" | "NE" | "NV" | "NH"
  | "NJ" | "NM" | "NY" | "NC" | "ND" | "OH" | "OK" | "OR" | "PA" | "RI"
  | "SC" | "SD" | "TN" | "TX" | "UT" | "VT" | "VA" | "WA" | "WV" | "WI" | "WY";

export const US_STATE_LABELS: Record<USState, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

type StateTaxConfig =
  | { type: "none" }
  | { type: "flat"; rate: number; standardDeduction: number }
  | { type: "bracket"; brackets: TaxBracket[]; standardDeduction: number };

// Single filer, approximate published 2024-2025 rates. No-tax states carry
// zero marginal cost to model; flat/bracket states use each state's own
// standard deduction (or closest published equivalent — several states use
// personal exemptions or credits instead, approximated here as a deduction
// for consistency) subtracted from gross before applying the rate/brackets.
export const US_STATE_TAX: Record<USState, StateTaxConfig> = {
  AK: { type: "none" }, FL: { type: "none" }, NV: { type: "none" },
  NH: { type: "none" }, SD: { type: "none" }, TN: { type: "none" },
  TX: { type: "none" }, WA: { type: "none" }, WY: { type: "none" },

  AZ: { type: "flat", rate: 0.025, standardDeduction: 14600 },
  CO: { type: "flat", rate: 0.044, standardDeduction: 14600 },
  GA: { type: "flat", rate: 0.0539, standardDeduction: 12000 },
  IL: { type: "flat", rate: 0.0495, standardDeduction: 2775 },
  IN: { type: "flat", rate: 0.0305, standardDeduction: 1000 },
  KY: { type: "flat", rate: 0.04, standardDeduction: 3160 },
  MA: { type: "flat", rate: 0.05, standardDeduction: 4400 },
  MI: { type: "flat", rate: 0.0425, standardDeduction: 5400 },
  NC: { type: "flat", rate: 0.045, standardDeduction: 12750 },
  PA: { type: "flat", rate: 0.0307, standardDeduction: 0 },
  UT: { type: "flat", rate: 0.0455, standardDeduction: 0 },
  ID: { type: "flat", rate: 0.058, standardDeduction: 14600 },
  IA: { type: "flat", rate: 0.038, standardDeduction: 2210 },
  MT: { type: "flat", rate: 0.059, standardDeduction: 14600 },
  LA: { type: "flat", rate: 0.03, standardDeduction: 12500 },

  MS: { type: "bracket", standardDeduction: 2300, brackets: [{ upTo: 10000, rate: 0 }, { upTo: null, rate: 0.047 }] },
  AL: { type: "bracket", standardDeduction: 2500, brackets: [{ upTo: 500, rate: 0.02 }, { upTo: 3000, rate: 0.04 }, { upTo: null, rate: 0.05 }] },
  AR: { type: "bracket", standardDeduction: 2340, brackets: [{ upTo: 5100, rate: 0.02 }, { upTo: 10300, rate: 0.04 }, { upTo: null, rate: 0.039 }] },
  CA: {
    type: "bracket", standardDeduction: 5363,
    brackets: [
      { upTo: 10756, rate: 0.01 }, { upTo: 25499, rate: 0.02 }, { upTo: 40245, rate: 0.04 },
      { upTo: 55866, rate: 0.06 }, { upTo: 70606, rate: 0.08 }, { upTo: 360659, rate: 0.093 },
      { upTo: 432787, rate: 0.103 }, { upTo: 721314, rate: 0.113 }, { upTo: null, rate: 0.123 },
    ],
  },
  CT: { type: "bracket", standardDeduction: 0, brackets: [{ upTo: 10000, rate: 0.02 }, { upTo: 50000, rate: 0.045 }, { upTo: 100000, rate: 0.055 }, { upTo: 200000, rate: 0.06 }, { upTo: 250000, rate: 0.065 }, { upTo: 500000, rate: 0.069 }, { upTo: null, rate: 0.0699 }] },
  DE: { type: "bracket", standardDeduction: 3250, brackets: [{ upTo: 2000, rate: 0 }, { upTo: 5000, rate: 0.022 }, { upTo: 10000, rate: 0.039 }, { upTo: 20000, rate: 0.048 }, { upTo: 25000, rate: 0.052 }, { upTo: 60000, rate: 0.0555 }, { upTo: null, rate: 0.066 }] },
  DC: { type: "bracket", standardDeduction: 14600, brackets: [{ upTo: 10000, rate: 0.04 }, { upTo: 40000, rate: 0.06 }, { upTo: 60000, rate: 0.065 }, { upTo: 250000, rate: 0.085 }, { upTo: 500000, rate: 0.0925 }, { upTo: 1000000, rate: 0.0975 }, { upTo: null, rate: 0.1075 }] },
  HI: { type: "bracket", standardDeduction: 2200, brackets: [{ upTo: 9600, rate: 0.014 }, { upTo: 19200, rate: 0.032 }, { upTo: 28800, rate: 0.055 }, { upTo: 38400, rate: 0.064 }, { upTo: 48000, rate: 0.068 }, { upTo: 72000, rate: 0.072 }, { upTo: 96000, rate: 0.076 }, { upTo: 120000, rate: 0.079 }, { upTo: null, rate: 0.11 } ] },
  KS: { type: "bracket", standardDeduction: 3500, brackets: [{ upTo: 15000, rate: 0.031 }, { upTo: 30000, rate: 0.0525 }, { upTo: null, rate: 0.057 }] },
  ME: { type: "bracket", standardDeduction: 14600, brackets: [{ upTo: 26050, rate: 0.058 }, { upTo: 61600, rate: 0.0675 }, { upTo: null, rate: 0.0715 }] },
  MD: { type: "bracket", standardDeduction: 2400, brackets: [{ upTo: 1000, rate: 0.02 }, { upTo: 2000, rate: 0.03 }, { upTo: 3000, rate: 0.04 }, { upTo: 100000, rate: 0.0475 }, { upTo: 125000, rate: 0.05 }, { upTo: 150000, rate: 0.0525 }, { upTo: 250000, rate: 0.055 }, { upTo: null, rate: 0.0575 }] },
  MN: { type: "bracket", standardDeduction: 14575, brackets: [{ upTo: 31690, rate: 0.0535 }, { upTo: 104090, rate: 0.068 }, { upTo: 193240, rate: 0.0785 }, { upTo: null, rate: 0.0985 }] },
  MO: { type: "bracket", standardDeduction: 14600, brackets: [{ upTo: 1273, rate: 0.02 }, { upTo: 2546, rate: 0.025 }, { upTo: 3819, rate: 0.03 }, { upTo: 5092, rate: 0.035 }, { upTo: 6365, rate: 0.04 }, { upTo: 7638, rate: 0.045 }, { upTo: null, rate: 0.0495 }] },
  NE: { type: "bracket", standardDeduction: 7900, brackets: [{ upTo: 3700, rate: 0.0246 }, { upTo: 22170, rate: 0.0351 }, { upTo: 35730, rate: 0.0501 }, { upTo: null, rate: 0.0584 }] },
  NJ: { type: "bracket", standardDeduction: 1000, brackets: [{ upTo: 20000, rate: 0.014 }, { upTo: 35000, rate: 0.0175 }, { upTo: 40000, rate: 0.035 }, { upTo: 75000, rate: 0.05525 }, { upTo: 500000, rate: 0.0637 }, { upTo: 1000000, rate: 0.0897 }, { upTo: null, rate: 0.1075 }] },
  NM: { type: "bracket", standardDeduction: 14600, brackets: [{ upTo: 5500, rate: 0.017 }, { upTo: 11000, rate: 0.032 }, { upTo: 16000, rate: 0.047 }, { upTo: 210000, rate: 0.049 }, { upTo: null, rate: 0.059 }] },
  NY: { type: "bracket", standardDeduction: 8000, brackets: [{ upTo: 8500, rate: 0.04 }, { upTo: 11700, rate: 0.045 }, { upTo: 13900, rate: 0.0525 }, { upTo: 80650, rate: 0.055 }, { upTo: 215400, rate: 0.06 }, { upTo: 1077550, rate: 0.0685 }, { upTo: 5000000, rate: 0.0965 }, { upTo: 25000000, rate: 0.103 }, { upTo: null, rate: 0.109 }] },
  ND: { type: "bracket", standardDeduction: 14600, brackets: [{ upTo: 47150, rate: 0 }, { upTo: 238950, rate: 0.0195 }, { upTo: null, rate: 0.025 }] },
  OH: { type: "bracket", standardDeduction: 0, brackets: [{ upTo: 26050, rate: 0 }, { upTo: 100000, rate: 0.0275 }, { upTo: null, rate: 0.035 }] },
  OK: { type: "bracket", standardDeduction: 6350, brackets: [{ upTo: 1000, rate: 0.0025 }, { upTo: 2500, rate: 0.0075 }, { upTo: 3750, rate: 0.0175 }, { upTo: 4900, rate: 0.0275 }, { upTo: 7200, rate: 0.0375 }, { upTo: null, rate: 0.0475 }] },
  OR: { type: "bracket", standardDeduction: 2745, brackets: [{ upTo: 4300, rate: 0.0475 }, { upTo: 10750, rate: 0.0675 }, { upTo: 125000, rate: 0.0875 }, { upTo: null, rate: 0.099 }] },
  RI: { type: "bracket", standardDeduction: 10550, brackets: [{ upTo: 73450, rate: 0.0375 }, { upTo: 166950, rate: 0.0475 }, { upTo: null, rate: 0.0599 }] },
  SC: { type: "bracket", standardDeduction: 14600, brackets: [{ upTo: 3460, rate: 0 }, { upTo: 17330, rate: 0.03 }, { upTo: null, rate: 0.062 }] },
  VT: { type: "bracket", standardDeduction: 7000, brackets: [{ upTo: 45400, rate: 0.0335 }, { upTo: 110050, rate: 0.066 }, { upTo: 229550, rate: 0.076 }, { upTo: null, rate: 0.0875 }] },
  VA: { type: "bracket", standardDeduction: 8000, brackets: [{ upTo: 3000, rate: 0.02 }, { upTo: 5000, rate: 0.03 }, { upTo: 17000, rate: 0.05 }, { upTo: null, rate: 0.0575 }] },
  WV: { type: "bracket", standardDeduction: 0, brackets: [{ upTo: 10000, rate: 0.0236 }, { upTo: 25000, rate: 0.0315 }, { upTo: 40000, rate: 0.0354 }, { upTo: 60000, rate: 0.0407 }, { upTo: null, rate: 0.0482 }] },
  WI: { type: "bracket", standardDeduction: 13230, brackets: [{ upTo: 14320, rate: 0.035 }, { upTo: 28640, rate: 0.044 }, { upTo: 315310, rate: 0.053 }, { upTo: null, rate: 0.0765 }] },
};

export const US_FEDERAL_BRACKETS: TaxBracket[] = [
  { upTo: 11925, rate: 0.10 },
  { upTo: 48475, rate: 0.12 },
  { upTo: 103350, rate: 0.22 },
  { upTo: 197300, rate: 0.24 },
  { upTo: 250525, rate: 0.32 },
  { upTo: 626350, rate: 0.35 },
  { upTo: null, rate: 0.37 },
];

export const US_FEDERAL_STANDARD_DEDUCTION = 15000;

const SOCIAL_SECURITY_WAGE_BASE_2025 = 176100;
const SOCIAL_SECURITY_RATE = 0.062;
const MEDICARE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = 200000;
const ADDITIONAL_MEDICARE_RATE = 0.009;

function calculateFica(grossIncome: number): number {
  const socialSecurity = Math.min(grossIncome, SOCIAL_SECURITY_WAGE_BASE_2025) * SOCIAL_SECURITY_RATE;
  const medicare = grossIncome * MEDICARE_RATE;
  const additionalMedicare = Math.max(0, grossIncome - ADDITIONAL_MEDICARE_THRESHOLD_SINGLE) * ADDITIONAL_MEDICARE_RATE;
  return socialSecurity + medicare + additionalMedicare;
}

// ---------------------------------------------------------------------------
// Canada
// ---------------------------------------------------------------------------

export type CAProvince = "AB" | "BC" | "MB" | "NB" | "NL" | "NS" | "NT" | "NU" | "ON" | "PE" | "QC" | "SK" | "YT";

export const CA_PROVINCE_LABELS: Record<CAProvince, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick",
  NL: "Newfoundland and Labrador", NS: "Nova Scotia", NT: "Northwest Territories",
  NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec",
  SK: "Saskatchewan", YT: "Yukon",
};

type ProvinceTaxConfig = { brackets: TaxBracket[]; basicPersonalAmount: number };

// Approximate published 2024 rates. Quebec's separate federal-tax abatement
// (a ~16.5% reduction of federal tax for Quebec residents, offset by higher
// provincial rates) is NOT modeled — Quebec figures here will read slightly
// high on the federal side as a result.
export const CA_PROVINCE_TAX: Record<CAProvince, ProvinceTaxConfig> = {
  ON: { basicPersonalAmount: 11865, brackets: [{ upTo: 51446, rate: 0.0505 }, { upTo: 102894, rate: 0.0915 }, { upTo: 150000, rate: 0.1116 }, { upTo: 220000, rate: 0.1216 }, { upTo: null, rate: 0.1316 }] },
  QC: { basicPersonalAmount: 18056, brackets: [{ upTo: 51780, rate: 0.14 }, { upTo: 103545, rate: 0.19 }, { upTo: 126000, rate: 0.24 }, { upTo: null, rate: 0.2575 }] },
  BC: { basicPersonalAmount: 12580, brackets: [{ upTo: 47937, rate: 0.0506 }, { upTo: 95875, rate: 0.077 }, { upTo: 110076, rate: 0.105 }, { upTo: 133664, rate: 0.1229 }, { upTo: 181232, rate: 0.147 }, { upTo: 252752, rate: 0.168 }, { upTo: null, rate: 0.205 }] },
  AB: { basicPersonalAmount: 21885, brackets: [{ upTo: 148269, rate: 0.10 }, { upTo: 177922, rate: 0.12 }, { upTo: 237230, rate: 0.13 }, { upTo: 355845, rate: 0.14 }, { upTo: null, rate: 0.15 }] },
  MB: { basicPersonalAmount: 15780, brackets: [{ upTo: 47000, rate: 0.108 }, { upTo: 100000, rate: 0.1275 }, { upTo: null, rate: 0.174 }] },
  SK: { basicPersonalAmount: 18491, brackets: [{ upTo: 52057, rate: 0.105 }, { upTo: 148734, rate: 0.125 }, { upTo: null, rate: 0.145 }] },
  NS: { basicPersonalAmount: 8744, brackets: [{ upTo: 29590, rate: 0.0879 }, { upTo: 59180, rate: 0.1495 }, { upTo: 93000, rate: 0.1667 }, { upTo: 150000, rate: 0.175 }, { upTo: null, rate: 0.21 }] },
  NB: { basicPersonalAmount: 13044, brackets: [{ upTo: 49958, rate: 0.094 }, { upTo: 99916, rate: 0.14 }, { upTo: 185064, rate: 0.16 }, { upTo: null, rate: 0.195 }] },
  NL: { basicPersonalAmount: 10818, brackets: [{ upTo: 44192, rate: 0.087 }, { upTo: 88382, rate: 0.145 }, { upTo: 157792, rate: 0.158 }, { upTo: 220910, rate: 0.178 }, { upTo: 282214, rate: 0.198 }, { upTo: 551739, rate: 0.208 }, { upTo: 1103478, rate: 0.213 }, { upTo: null, rate: 0.218 }] },
  PE: { basicPersonalAmount: 13500, brackets: [{ upTo: 32656, rate: 0.095 }, { upTo: 64313, rate: 0.1347 }, { upTo: 105000, rate: 0.166 }, { upTo: 140000, rate: 0.1762 }, { upTo: null, rate: 0.19 }] },
  YT: { basicPersonalAmount: 15705, brackets: [{ upTo: 55867, rate: 0.064 }, { upTo: 111733, rate: 0.09 }, { upTo: 173205, rate: 0.109 }, { upTo: 500000, rate: 0.128 }, { upTo: null, rate: 0.15 }] },
  NT: { basicPersonalAmount: 17373, brackets: [{ upTo: 50597, rate: 0.059 }, { upTo: 101198, rate: 0.086 }, { upTo: 164525, rate: 0.122 }, { upTo: null, rate: 0.1405 }] },
  NU: { basicPersonalAmount: 18767, brackets: [{ upTo: 53268, rate: 0.04 }, { upTo: 106537, rate: 0.07 }, { upTo: 173205, rate: 0.09 }, { upTo: null, rate: 0.115 }] },
};

export const CA_FEDERAL_BRACKETS: TaxBracket[] = [
  { upTo: 55867, rate: 0.15 },
  { upTo: 111733, rate: 0.205 },
  { upTo: 173205, rate: 0.26 },
  { upTo: 246752, rate: 0.29 },
  { upTo: null, rate: 0.33 },
];

export const CA_FEDERAL_BASIC_PERSONAL_AMOUNT = 15705;

const CPP_RATE = 0.0595;
const CPP_BASIC_EXEMPTION = 3500;
const CPP_YMPE_2024 = 68500; // year's maximum pensionable earnings — CPP2 additional tier above this is not modeled
const EI_RATE = 0.0166;
const EI_MAX_INSURABLE_EARNINGS_2024 = 63200;

function calculateCppEi(grossIncome: number): number {
  const cppEarnings = Math.max(0, Math.min(grossIncome, CPP_YMPE_2024) - CPP_BASIC_EXEMPTION);
  const cpp = cppEarnings * CPP_RATE;
  const ei = Math.min(grossIncome, EI_MAX_INSURABLE_EARNINGS_2024) * EI_RATE;
  return cpp + ei;
}

// ---------------------------------------------------------------------------
// Shared entry point
// ---------------------------------------------------------------------------

export type TaxEstimateInputs = {
  country: TaxCountry;
  annualGrossIncome: number | null;
  usState: USState | null;
  caProvince: CAProvince | null;
};

export const EMPTY_TAX_INPUTS: TaxEstimateInputs = {
  country: "us",
  annualGrossIncome: null,
  usState: null,
  caProvince: null,
};

export type TakeHomeResult = {
  federalTax: number;
  regionalTax: number; // state (US) or provincial (CA) tax
  payrollTax: number; // FICA (US) or CPP+EI (CA)
  totalTax: number;
  netAnnual: number;
  netMonthly: number;
  effectiveRate: number | null; // totalTax / gross, as a fraction
};

export function calculateTakeHome(inputs: TaxEstimateInputs): TakeHomeResult | null {
  const gross = inputs.annualGrossIncome;
  if (gross === null || gross <= 0) return null;

  if (inputs.country === "us") {
    const federalTaxable = Math.max(0, gross - US_FEDERAL_STANDARD_DEDUCTION);
    const federalTax = progressiveTax(federalTaxable, US_FEDERAL_BRACKETS);
    const payrollTax = calculateFica(gross);

    let regionalTax = 0;
    if (inputs.usState) {
      const config = US_STATE_TAX[inputs.usState];
      if (config.type === "flat") {
        regionalTax = Math.max(0, gross - config.standardDeduction) * config.rate;
      } else if (config.type === "bracket") {
        regionalTax = progressiveTax(Math.max(0, gross - config.standardDeduction), config.brackets);
      }
    }

    const totalTax = federalTax + regionalTax + payrollTax;
    const netAnnual = gross - totalTax;
    return { federalTax, regionalTax, payrollTax, totalTax, netAnnual, netMonthly: netAnnual / 12, effectiveRate: totalTax / gross };
  }

  const federalTaxable = Math.max(0, gross - CA_FEDERAL_BASIC_PERSONAL_AMOUNT);
  const federalTax = progressiveTax(federalTaxable, CA_FEDERAL_BRACKETS);
  const payrollTax = calculateCppEi(gross);

  let regionalTax = 0;
  if (inputs.caProvince) {
    const config = CA_PROVINCE_TAX[inputs.caProvince];
    regionalTax = progressiveTax(Math.max(0, gross - config.basicPersonalAmount), config.brackets);
  }

  const totalTax = federalTax + regionalTax + payrollTax;
  const netAnnual = gross - totalTax;
  return { federalTax, regionalTax, payrollTax, totalTax, netAnnual, netMonthly: netAnnual / 12, effectiveRate: totalTax / gross };
}
