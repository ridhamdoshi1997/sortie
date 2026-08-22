"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { createCheckoutSessionAction } from "@/actions/billing";

// Real Stripe Checkout trigger — createCheckoutSessionAction calls
// requireUser() server-side, which redirects an unauthenticated caller to
// /login itself, so a logged-out visitor clicking this just lands on
// /login same as any other gated action; no separate auth branch needed
// here.
export function UpgradeButton({ tier, className, children }: { tier: string; className?: string; children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await createCheckoutSessionAction(tier);
      if (!result.success) {
        setError(result.error);
        return;
      }
      window.location.assign(result.url);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={handleClick} disabled={isPending} className={className}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
      </button>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
