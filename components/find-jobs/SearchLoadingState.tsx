"use client";

import { GenerationProgress } from "@/components/ui/GenerationProgress";

// "Loading states that teach" (build-plan.md §H) — the search flow's real
// wait (a genuine SerpApi call, then real AI evaluation queued per result)
// previously had nothing between the button spinner and results appearing.
// Every stage below describes something this app actually does, in order —
// no invented progress percentage, no fake step count, just honest
// sequencing plus a real, appropriately-hedged time expectation. Now built
// on the same GenerationProgress card used for document generation
// (2026-08-21, direct user request to make loading states consistent
// "part of the design of the site," not a one-off per feature) instead of
// a plain spinner + text stack.
const STAGES = [
  "Searching Google Jobs for openings matching your criteria…",
  "Filtering for genuinely relevant, recently posted listings…",
  "Queuing each result for the 10-dimension evaluator…",
];

export function SearchLoadingState() {
  return (
    <div className="mt-6">
      <GenerationProgress
        title="Finding your matches"
        stages={STAGES}
        timeEstimate="Usually takes 10–20 seconds — evaluated results will appear below as they finish, you don't need to wait for all of them."
      />
    </div>
  );
}
