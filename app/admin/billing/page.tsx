import { getPlansForAdmin } from "@/actions/admin";
import { BillingHealthPanel } from "@/components/admin/BillingHealthPanel";
import { PlansManager } from "@/components/admin/PlansManager";
import { getBillingHealth } from "@/lib/admin/billingHealth";

export const dynamic = "force-dynamic";

// build-plan.md §J/§R — the "/admin/billing — stub until §J ships" slot
// referenced in the admin panel's original research is now real. Plans are
// read live everywhere in the app (lib/subscription.ts never caches a plan
// row), so anything edited here — price, monthly caps, marketing bullets,
// or a whole new/removed plan — reflects immediately for real users, no
// redeploy.
//
// Phase 52 section 6 added the business view above the editor. The editor
// itself is deliberately untouched: it worked, and the gap was that this
// page had no idea whether anyone was actually paying.
export default async function AdminBillingPage() {
  const [result, health] = await Promise.all([getPlansForAdmin(), getBillingHealth()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Billing & Plans</h1>
        <p className="text-sm text-text-secondary">
          Subscribers, revenue and Stripe sync health, plus the plan editor — pricing, monthly caps, and the LLM router
          unlock. Plan changes take effect immediately.
        </p>
      </div>
      <BillingHealthPanel health={health} />
      {!result.success ? (
        <p className="text-sm text-error">{result.error}</p>
      ) : (
        <PlansManager initialPlans={result.data} />
      )}
    </div>
  );
}
