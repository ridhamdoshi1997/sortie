import { redirect } from "next/navigation";

import { getExpensesPage, getAdminRoster } from "@/actions/admin";
import { ExpensesDashboard } from "@/components/admin/ExpensesDashboard";

export const dynamic = "force-dynamic";

export default async function AdminExpensesPage() {
  const [expensesResult, rosterResult] = await Promise.all([getExpensesPage(), getAdminRoster()]);

  if (!expensesResult.success || !rosterResult.success) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Expenses</h1>
        <p className="mt-1 text-sm text-text-secondary">
          What this project actually spends, separated by how well each number is known: measured live from a vendor,
          estimated from a rate times real usage, or entered by hand.
        </p>
      </div>
      <ExpensesDashboard initialData={expensesResult.data} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
