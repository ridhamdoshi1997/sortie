"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// "Loading states that teach" (build-plan.md §H) — the search flow's real
// wait (a genuine SerpApi call, then real AI evaluation queued per result)
// previously had nothing between the button spinner and results appearing.
// Every line here describes something this app actually does, in order —
// no invented progress percentage, no fake step count, just honest
// sequencing plus a real, appropriately-hedged time expectation.
const STAGES = [
  "Searching Google Jobs for openings matching your criteria…",
  "Filtering for genuinely relevant, recently posted listings…",
  "Queuing each result for the 10-dimension evaluator…",
];

export function SearchLoadingState() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 border-t border-border py-10 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-accent" />
      <p className="text-sm font-medium text-text-primary">{STAGES[stageIndex]}</p>
      <p className="text-xs text-text-muted">
        Usually takes 10–20 seconds — evaluated results will appear below as they finish, you don&apos;t need to wait for all of them.
      </p>
    </div>
  );
}
