import { AntiAutoApply } from "@/components/homepage/AntiAutoApply";
import { BentoFeatures } from "@/components/homepage/BentoFeatures";
import { CTASection } from "@/components/homepage/CTASection";
import { FullToolkit } from "@/components/homepage/FullToolkit";
import { Hero } from "@/components/homepage/Hero";
import { SuccessStory } from "@/components/homepage/SuccessStory";
import { TheLifecycle } from "@/components/homepage/TheLifecycle";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

export default function HomePage() {
  return (
    <>
      <Navbar />
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
