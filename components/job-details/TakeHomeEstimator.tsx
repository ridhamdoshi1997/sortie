"use client";

import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";

import { saveTaxEstimateInputs } from "@/actions/jobs";
import {
  CA_PROVINCE_LABELS,
  US_STATE_LABELS,
  calculateTakeHome,
  type CAProvince,
  type TaxCountry,
  type TaxEstimateInputs,
  type USState,
} from "@/lib/taxCalculator";
import { formatCurrency } from "@/lib/equityDecoder";
import { FormLabel, FormSelect } from "@/components/ui/FormControls";

type Props = {
  jobId: string;
  initialInputs: TaxEstimateInputs | null;
  defaultGrossIncome: number | null;
};

const COUNTRY_OPTIONS: { value: TaxCountry; label: string }[] = [
  { value: "us", label: "United States" },
  { value: "ca", label: "Canada" },
];

const US_STATE_OPTIONS = (Object.keys(US_STATE_LABELS) as USState[]).sort((a, b) =>
  US_STATE_LABELS[a].localeCompare(US_STATE_LABELS[b]),
);
const CA_PROVINCE_OPTIONS = (Object.keys(CA_PROVINCE_LABELS) as CAProvince[]).sort((a, b) =>
  CA_PROVINCE_LABELS[a].localeCompare(CA_PROVINCE_LABELS[b]),
);

function numberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Salary Tax & Take-Home Calculator — same "pure calculator, no AI" spirit
// as EquityDecoder.tsx, sharing this tab's parent card via OfferWorkspace.tsx
// rather than its own outer section. See lib/taxCalculator.ts's header
// comment for the full scoping/accuracy caveat — single filer / basic
// personal amount only, published brackets that will drift from the exact
// current-year figures. The disclaimer below must stay visible, not just
// live in code comments.
export function TakeHomeEstimator({ jobId, initialInputs, defaultGrossIncome }: Props) {
  const [inputs, setInputs] = useState<TaxEstimateInputs>(
    initialInputs ?? {
      country: "us",
      annualGrossIncome: defaultGrossIncome,
      usState: null,
      caProvince: null,
    },
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const result = useMemo(() => calculateTakeHome(inputs), [inputs]);

  function update<K extends keyof TaxEstimateInputs>(key: K, value: TaxEstimateInputs[K]): void {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave(): void {
    setError(null);
    startTransition(async () => {
      const res = await saveTaxEstimateInputs(jobId, inputs);
      if (res.success) {
        setSaved(true);
      } else {
        setError(res.error ?? "Failed to save tax calculator inputs");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          Estimated federal + state/provincial income tax and payroll tax (FICA / CPP+EI), based on published tax
          brackets for a single filer. Not a filing tool — verify with a real calculator or professional before
          relying on this for a decision.
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          {saved && !isPending ? <Check className="h-4 w-4 text-success-foreground" /> : null}
          {isPending ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <FormLabel>Country</FormLabel>
          <FormSelect
            options={COUNTRY_OPTIONS.map((o) => o.label)}
            value={COUNTRY_OPTIONS.find((o) => o.value === inputs.country)?.label ?? ""}
            onChange={(label) => {
              const match = COUNTRY_OPTIONS.find((o) => o.label === label);
              if (match) update("country", match.value);
            }}
          />
        </div>

        {inputs.country === "us" ? (
          <div>
            <FormLabel>State</FormLabel>
            <FormSelect
              placeholder="Select a state"
              options={US_STATE_OPTIONS.map((code) => US_STATE_LABELS[code])}
              value={inputs.usState ? US_STATE_LABELS[inputs.usState] : ""}
              onChange={(label) => {
                const match = US_STATE_OPTIONS.find((code) => US_STATE_LABELS[code] === label);
                if (match) update("usState", match);
              }}
            />
          </div>
        ) : (
          <div>
            <FormLabel>Province / territory</FormLabel>
            <FormSelect
              placeholder="Select a province"
              options={CA_PROVINCE_OPTIONS.map((code) => CA_PROVINCE_LABELS[code])}
              value={inputs.caProvince ? CA_PROVINCE_LABELS[inputs.caProvince] : ""}
              onChange={(label) => {
                const match = CA_PROVINCE_OPTIONS.find((code) => CA_PROVINCE_LABELS[code] === label);
                if (match) update("caProvince", match);
              }}
            />
          </div>
        )}

        <div>
          <FormLabel>Annual gross income</FormLabel>
          <input
            type="number"
            placeholder="165000"
            value={inputs.annualGrossIncome === null ? "" : String(inputs.annualGrossIncome)}
            onChange={(e) => update("annualGrossIncome", numberOrNull(e.target.value))}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {result && (
        // Same "results panel" treatment as EquityDecoder.tsx's Stat grid —
        // see that file's comment (2026-08-25, direct user report).
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-accent/25 bg-border-light sm:grid-cols-4">
          <Stat index={0} label="Federal tax" value={formatCurrency(result.federalTax)} />
          <Stat index={1} label={inputs.country === "us" ? "State tax" : "Provincial tax"} value={formatCurrency(result.regionalTax)} />
          <Stat index={2} label={inputs.country === "us" ? "FICA" : "CPP + EI"} value={formatCurrency(result.payrollTax)} />
          <Stat index={3} label="Total tax" value={formatCurrency(result.totalTax)} warn />
          <Stat index={4} label="Net annual pay" value={formatCurrency(result.netAnnual)} />
          <Stat index={5} label="Net monthly pay" value={formatCurrency(result.netMonthly)} />
          {result.effectiveRate !== null && (
            <Stat index={6} label="Effective tax rate" value={`${(result.effectiveRate * 100).toFixed(1)}%`} />
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn, index = 0 }: { label: string; value: string; warn?: boolean; index?: number }) {
  return (
    <div
      className="dim-card-in flex flex-col gap-1 bg-surface-secondary p-4 transition-colors hover:bg-surface"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`font-mono text-base font-bold tabular-nums ${warn ? "text-warning" : "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}
