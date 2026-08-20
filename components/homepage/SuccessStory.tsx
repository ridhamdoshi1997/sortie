// Rebuilt for build-plan.md §S. The previous version of this component
// presented a fabricated testimonial (an invented name, quote, and stock
// photo) as a real user story — a direct violation of this app's own
// honesty-in-UI principle (no invented claims anywhere else in the
// product). Replaced with a real, verifiable trust band instead of a
// manufactured persona: facts about what the product actually does, not a
// fake social-proof number.
const TRUST_FACTS = [
  "10 real evaluation dimensions, every job",
  "Zero unattended submissions, ever",
  "Every AI-generated read clearly marked",
];

export function SuccessStory() {
  return (
    <section className="px-4 py-14 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 rounded-2xl border border-border bg-surface px-6 py-10 text-center sm:flex-row sm:justify-between sm:gap-4 sm:text-left">
        {TRUST_FACTS.map((fact) => (
          <p key={fact} className="text-sm font-medium text-text-secondary">
            {fact}
          </p>
        ))}
      </div>
    </section>
  );
}
