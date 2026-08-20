import type { Metadata } from "next";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CTASection } from "@/components/homepage/CTASection";

export const metadata: Metadata = {
  title: "Pricing — Sortie",
  description: "Free to start, no unattended applications ever. See what's included today and what's coming with Pro.",
};

// Dedicated pricing page (build-plan.md §S fast-follow) — reuses
// CTASection.tsx directly rather than duplicating the pricing cards; the
// homepage's #pricing anchor still works (same component, same id), this
// is just a stable, linkable URL for it plus a short honest FAQ.
function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-text-primary">{question}</h2>
      <p className="text-sm leading-6 text-text-secondary">{children}</p>
    </div>
  );
}

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main className="pb-0">
        <div className="mx-auto max-w-3xl px-4 pt-16 text-center sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Pricing</h1>
        </div>
        <CTASection />
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pb-16 sm:px-6 lg:px-8">
          <FaqItem question="Will my free access change later?">
            The free tier is real, currently-shipped access — not a limited trial. If a paid tier
            eventually launches, existing free capabilities stay available; Pro adds higher usage
            limits and deeper research tools on top, it doesn&apos;t take anything away.
          </FaqItem>
          <FaqItem question="Do you ever submit applications automatically?">
            No, never — on any plan. See the full{" "}
            <a href="/methodology" className="font-medium text-accent hover:opacity-80">
              methodology
            </a>{" "}
            for why.
          </FaqItem>
          <FaqItem question="When is Pro available?">
            Not yet — it&apos;s marked &ldquo;Coming soon&rdquo; because it genuinely isn&apos;t live. We&apos;d
            rather show that honestly than a price we can&apos;t back yet.
          </FaqItem>
        </div>
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
