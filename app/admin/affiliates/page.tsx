import { getAffiliatesForAdmin } from "@/actions/admin";
import { AffiliatesManager } from "@/components/admin/AffiliatesManager";

export const dynamic = "force-dynamic";

// Affiliate program admin console (direct user request, 2026-08-30).
export default async function AdminAffiliatesPage() {
  const rows = await getAffiliatesForAdmin();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Affiliates</h1>
        <p className="text-sm text-text-secondary">
          Approve applicants, set commission rates, and pay out unpaid balances via PayPal.
        </p>
      </div>
      <AffiliatesManager initialRows={rows} />
    </div>
  );
}
