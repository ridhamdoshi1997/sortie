import { AntiAutoApply } from "@/components/homepage/AntiAutoApply";
import { BentoFeatures } from "@/components/homepage/BentoFeatures";
import { CTASection } from "@/components/homepage/CTASection";
import { FullToolkit } from "@/components/homepage/FullToolkit";
import { Hero } from "@/components/homepage/Hero";
import { SuccessStory } from "@/components/homepage/SuccessStory";
import { TheLifecycle } from "@/components/homepage/TheLifecycle";
import { Footer } from "@/components/layout/Footer";
import { NavbarAuto } from "@/components/layout/NavbarAuto";
import { AuthStateProvider } from "@/components/auth/AuthStateProvider";

// Used to call getCurrentUser() server-side just to pick Navbar's
// isAuthenticated prop (so a signed-in user clicking the logo, which
// links here, saw their real nav instead of "Log in"/"Start for free").
// That fixed the nav but broke something bigger: touching cookies()
// anywhere in a route's render forces Next.js to treat the WHOLE route
// as dynamic — confirmed live, this page served Cache-Control: no-store
// on every request, ~2.7s cold starts, zero caching, ever. Now static:
// NavbarAuto/AuthStateProvider resolve the real auth state client-side
// (optimistic cookie-presence check before paint, then an authoritative
// /api/auth/refresh reconcile) instead of blocking the server render.
// See components/auth/AuthStateProvider.tsx for the full mechanism and
// its known trade-offs (a possible brief flash on a very slow connection,
// a new client-side request per page load).
export default function HomePage() {
  return (
    <AuthStateProvider>
      <NavbarAuto />
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
    </AuthStateProvider>
  );
}
