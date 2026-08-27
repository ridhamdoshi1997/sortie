import { AntiAutoApply } from "@/components/homepage/AntiAutoApply";
import { BentoFeatures } from "@/components/homepage/BentoFeatures";
import { CTASection } from "@/components/homepage/CTASection";
import { FullToolkit } from "@/components/homepage/FullToolkit";
import { Hero } from "@/components/homepage/Hero";
import { SuccessStory } from "@/components/homepage/SuccessStory";
import { TheLifecycle } from "@/components/homepage/TheLifecycle";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  // Was rendering <Navbar /> with no isAuthenticated prop at all, so it
  // defaulted to the logged-out marketing nav unconditionally — a signed-in
  // user clicking the logo (which links here) saw "Log in"/"Start for free"
  // even though their session was still very much alive underneath. Mirrors
  // the same check app/pricing/page.tsx already does correctly.
  const user = await getCurrentUser();

  return (
    <>
      <Navbar isAuthenticated={Boolean(user)} />
      <main className="pb-0">
        <Hero />
        <SuccessStory />
        <BentoFeatures />
        <AntiAutoApply />
        <TheLifecycle />
        <FullToolkit />
        <CTASection />
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
