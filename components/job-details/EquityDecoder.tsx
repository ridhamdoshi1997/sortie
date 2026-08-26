"use client";

import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";

import { saveOfferDetails } from "@/actions/jobs";
import { decodeOffer, EMPTY_OFFER_DETAILS, formatCurrency, type EquityType, type OfferDetails } from "@/lib/equityDecoder";
import { FormInput, FormLabel, FormSelect } from "@/components/ui/FormControls";

type Props = {
  jobId: string;
  initialDetails: OfferDetails | null;
};

const EQUITY_TYPE_OPTIONS: { value: EquityType; label: string }[] = [
  { value: "none", label: "No equity offered" },
  { value: "rsu", label: "RSUs" },
  { value: "iso", label: "ISOs (incentive stock options)" },
  { value: "nso", label: "NSOs (non-qualified stock options)" },
];

// Numeric inputs round-trip through strings so a field can sit empty while
// being typed into, rather than snapping to "0" — this.value comes back as
// null (not 0) whenever the field is blank, which decodeOffer treats as
// "not entered" rather than a real zero.
function numberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FormLabel>{label}</FormLabel>
      <FormInput
        type="number"
        placeholder={placeholder}
        value={value === null ? "" : String(value)}
        onChange={(v) => onChange(numberOrNull(v))}
      />
    </div>
  );
}

// Rescoped from a funding-data lookup (would need Crunchbase, no free tier)
// to a pure calculator on numbers the candidate types in themselves — see
// lib/equityDecoder.ts's header comment and context/build-plan.md §M. This
// is user-entered data, not AI output, so it deliberately does NOT get the
// "AI Navigator reads" agent-teal treatment (ui-rules.md's Agent Content section) —
// ordinary card/form styling only.
export function EquityDecoder({ jobId, initialDetails }: Props) {
  const [details, setDetails] = useState<OfferDetails>(initialDetails ?? EMPTY_OFFER_DETAILS);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const result = useMemo(() => decodeOffer(details), [details]);
  const isOption = details.equityType === "iso" || details.equityType === "nso";
  const hasEquity = details.equityType !== "none";

  function update<K extends keyof OfferDetails>(key: K, value: OfferDetails[K]): void {
    setDetails((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave(): void {
    setError(null);
    startTransition(async () => {
      const res = await saveOfferDetails(jobId, details);
      if (res.success) {
        setSaved(true);
      } else {
        setError(res.error ?? "Failed to save offer details");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          Type in the numbers from your own offer letter — this is a plain calculator on your input, not a
          market-rate lookup. Nothing here is compared against outside data.
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          {saved && !isPending ? <Check className="h-4 w-4 text-success-foreground" /> : null}
          {isPending ? "Saving..." : saved ? "Saved" : "Save offer numbers"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField label="Base salary" placeholder="150000" value={details.baseSalary} onChange={(v) => update("baseSalary", v)} />
        <NumberField label="Signing bonus" placeholder="10000" value={details.signingBonus} onChange={(v) => update("signingBonus", v)} />
        <NumberField
          label="Annual bonus target"
          placeholder="15000"
          value={details.annualBonusTarget}
          onChange={(v) => update("annualBonusTarget", v)}
        />
        <div>
          <FormLabel>Equity type</FormLabel>
          <FormSelect
            options={EQUITY_TYPE_OPTIONS.map((o) => o.label)}
            value={EQUITY_TYPE_OPTIONS.find((o) => o.value === details.equityType)?.label ?? ""}
            onChange={(label) => {
              const match = EQUITY_TYPE_OPTIONS.find((o) => o.label === label);
              if (match) update("equityType", match.value);
            }}
          />
        </div>
      </div>

      {hasEquity && (
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <NumberField
            label="Number of shares/units"
            placeholder="5000"
            value={details.numberOfShares}
            onChange={(v) => update("numberOfShares", v)}
          />
          <NumberField
            label="Current FMV / 409A price per share"
            placeholder="4.50"
            value={details.currentFmv}
            onChange={(v) => update("currentFmv", v)}
          />
          {isOption && (
            <NumberField
              label="Strike price per share"
              placeholder="1.20"
              value={details.strikePrice}
              onChange={(v) => update("strikePrice", v)}
            />
          )}
          <NumberField
            label="Vesting period (years)"
            placeholder="4"
            value={details.vestingYears}
            onChange={(v) => update("vestingYears", v)}
          />
          <NumberField
            label="Cliff (months)"
            placeholder="12"
            value={details.cliffMonths}
            onChange={(v) => update("cliffMonths", v)}
          />
          <NumberField
            label="Total shares outstanding (optional, for ownership %)"
            placeholder="10000000"
            value={details.totalSharesOutstanding}
            onChange={(v) => update("totalSharesOutstanding", v)}
          />
        </div>
      )}

      {(details.baseSalary !== null || hasEquity) && (
        // Real "results panel" treatment, not a plain bordered box
        // (2026-08-25, direct user report — Offer Tools still not "up to
        // par"). Accent-tinted border (this is calculated FROM user input,
        // not AI output — accent, never agent, per ui-tokens.md's
        // invariant), hairline dividers between cells via grid gap +
        // bg-border-light, each cell staggers in and highlights on hover.
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-accent/25 bg-border-light sm:grid-cols-4">
          <Stat index={0} label="Year 1 total comp" value={formatCurrency(result.totalComp.year1)} />
          <Stat index={1} label="Steady-state annual comp" value={formatCurrency(result.totalComp.steadyState)} />
          {hasEquity && <Stat index={2} label="Full grant value at today's FMV" value={formatCurrency(result.grantValueAtFmv)} />}
          {isOption && <Stat index={3} label="Cost to exercise full grant" value={formatCurrency(result.exerciseCost)} />}
          {isOption && result.spreadAtFmv !== null && (
            <Stat
              index={4}
              label="Spread at today's FMV"
              value={formatCurrency(result.spreadAtFmv)}
              warn={result.isUnderwater === true}
            />
          )}
          {result.ownershipPercent !== null && <Stat index={5} label="Approx. ownership" value={`${result.ownershipPercent}%`} />}
        </div>
      )}

      {isOption && result.isUnderwater && (
        <p className="mt-3 text-xs font-medium text-warning">
          These options are underwater at today&apos;s FMV — the strike price is above the current per-share value, so
          exercising now would cost more than the shares are currently worth.
        </p>
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
