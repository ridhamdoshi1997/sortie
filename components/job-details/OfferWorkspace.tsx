import { EquityDecoder } from "@/components/job-details/EquityDecoder";
import { TakeHomeEstimator } from "@/components/job-details/TakeHomeEstimator";
import { Tabs } from "@/components/ui/Tabs";
import { decodeOffer, EMPTY_OFFER_DETAILS } from "@/lib/equityDecoder";
import type { Job } from "@/types";

type Props = {
  jobId: string;
  offerDetails: Job["offer_details"];
  taxEstimateInputs: Job["tax_estimate_inputs"];
};

// One shared card for the two calculators (Equity & Cap Table Decoder,
// Salary Tax & Take-Home Calculator) via a tab switcher rather than two
// stacked cards — both are pure, non-AI calculators on user-entered numbers,
// so grouping them reads as one workspace instead of two unrelated
// sections. Rendered as its own top-level "Offer Tools" page tab (see
// app/find-jobs/[id]/page.tsx) — available to every job regardless of
// application_status, not gated to the Offer stage, so a candidate can plan
// numbers before an offer even exists. No header here since the outer page
// tab already labels it "Offer Tools". Post-Offer Leverage Synthesizer
// stays separate and IS still gated to application_status === "offered" —
// unlike these two, it's grounded in real offer-stage timing data (days at
// the Offer stage) that doesn't exist before an offer is made, and it's an
// AI call with the distinct "Agent read" treatment, not a calculator.
export function OfferWorkspace({ jobId, offerDetails, taxEstimateInputs }: Props) {
  // Prefill the tax calculator's income field from the last-saved equity
  // numbers, not live unsaved edits in the other tab (that would need lifting
  // state across tabs for a one-time default) — still fully editable.
  const defaultGrossIncome = decodeOffer(offerDetails ?? EMPTY_OFFER_DETAILS).totalComp.year1;

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <Tabs
        tabs={[
          {
            id: "equity",
            label: "Equity & Cap Table",
            content: <EquityDecoder jobId={jobId} initialDetails={offerDetails} />,
          },
          {
            id: "tax",
            label: "Tax Calculator",
            content: (
              <TakeHomeEstimator jobId={jobId} initialInputs={taxEstimateInputs} defaultGrossIncome={defaultGrossIncome} />
            ),
          },
        ]}
      />
    </section>
  );
}
