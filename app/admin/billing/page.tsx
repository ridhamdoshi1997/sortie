import { getPlansForAdmin } from "@/actions/admin";
import { PlansManager } from "@/components/admin/PlansManager";

export const dynamic = "force-dynamic";

// build-plan.md §J/§R — the "/admin/billing — stub until §J ships" slot
// referenced in the admin panel's original research is now real. Plans are
// read live everywhere in the app (lib/subscription.ts never caches a plan
// row), so anything edited here — price, monthly caps, marketing bullets,
// or a whole new/removed plan — reflects immediately for real users, no
// redeploy.
export default async function AdminBillingPage() {
  const result = await getPlansForAdmin();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Billing & Plans</h1>
        <p className="text-sm text-text-secondary">
          Manage subscription tiers — pricing, monthly caps, and the LLM router unlock. Changes take effect immediately.
        </p>
      </div>
      {!result.success ? (
        <p className="text-sm text-error">{result.error}</p>
      ) : (
        <PlansManager initialPlans={result.data} />
      )}
    </div>
  );
}
