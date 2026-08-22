"use client";

import { LoadingStateWithTips } from "@/components/ui/LoadingStateWithTips";

// "Loading states that teach" (build-plan.md §H) — real capabilities of
// this app, not invented copy. This is the search/evaluation-specific
// "teaches a feature" pattern from app/preview/page.tsx's DemoLoadingState
// mockup (distinct from GenerationProgress, used for single-artifact
// generations like a tailored resume) — a longer, higher-stakes wait
// pairs better with something genuinely true about the app than with a
// bare usage count.
const TIPS = [
  {
    title: "Every job gets 10 dimensions",
    body: "Skills, seniority, comp, location, growth, culture, visa, effort, legitimacy — each graded with a reason you can read.",
  },
  {
    title: "We flag ghost listings",
    body: "Vague comp and generic boilerplate get graded harshly, so you don't waste an afternoon on a posting that isn't real.",
  },
  {
    title: "Tailoring never invents experience",
    body: "Sortie only mirrors keywords your actual history supports — no invented skills, ever.",
  },
];

export function SearchLoadingState() {
  return (
    <div className="mt-6">
      <LoadingStateWithTips
        statusText="Searching Google Jobs and evaluating each result against your profile…"
        timeEstimate="Usually takes 10–20 seconds — evaluated results will appear below as they finish, you don't need to wait for all of them."
        tips={TIPS}
      />
    </div>
  );
}
