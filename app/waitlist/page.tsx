import { Clock3, ShieldCheck } from "lucide-react";

import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

// Landed here via requireUser() in lib/auth.ts — the account already exists
// (InsForge provisions it on OAuth before any app code runs), this page
// just explains why access to the product itself is on hold.
export default function WaitlistPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1440px] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="w-full max-w-lg rounded-[24px] border border-border bg-surface p-8 text-center shadow-card sm:p-10">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
              <Clock3 aria-hidden className="h-4 w-4 text-accent" />
              You&apos;re on the waitlist
            </div>
            <h1 className="mt-6 text-3xl font-semibold leading-9 text-text-primary">
              Sortie is at capacity right now
            </h1>
            <p className="mt-4 text-base leading-7 text-text-secondary">
              We&apos;re keeping the early launch small so every application gets
              the agent&apos;s full attention. Your account is saved — we&apos;ll open
              more spots soon, and you&apos;ll get in automatically the next time
              you sign in once one opens up.
            </p>
            <div className="mt-8 flex items-center justify-center gap-2 text-sm font-medium text-text-secondary">
              <ShieldCheck aria-hidden className="h-4 w-4 text-accent" />
              No action needed — just check back later.
            </div>
          </div>
        </section>
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
