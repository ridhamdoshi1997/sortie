import { createAdminDbClient } from "@/lib/admin/client";
import { isAdminUser } from "@/lib/access";
import { ACTION_LABELS, type UsageAction } from "@/lib/usage";
import { getVendorCosts, type VendorCostLine } from "@/lib/admin/vendorCosts";

export type ExpenseCadence = "monthly" | "yearly" | "one_time";

export type BusinessExpenseRow = {
  id: string;
  name: string;
  category: string;
  amountCents: number;
  cadence: ExpenseCadence;
  createdAt: string;
};

export type AiCostRateRow = {
  action: UsageAction;
  label: string;
  rateCentsPerCall: number;
  provider: string | null;
  /**
   * False when no ai_cost_rates row exists for this action at all. Without
   * this the page could not tell "this action is genuinely free" apart from
   * "nobody has ever priced this action" — both rendered as $0.
   */
  rateIsSet: boolean;
  callsLast30d: number;
  /**
   * Of callsLast30d, how many came from an ADMIN_EMAILS account. Pre-launch
   * this is effectively all of them, and a number that looks like customer
   * demand but is actually the owner testing would be actively misleading.
   */
  adminCallsLast30d: number;
  estCostCentsLast30d: number;
};

export type ExpensesSummary = {
  expenses: BusinessExpenseRow[];
  aiCostRates: AiCostRateRow[];
  vendors: VendorCostLine[];
  totalRecurringMonthlyCents: number;
  totalAiCostCentsLast30d: number;
  /** Sum of vendor lines whose spend was genuinely measured from a vendor API. */
  totalMeasuredVendorCents: number;
  /** True when at least one vendor line reported a real measured figure. */
  anyVendorMeasured: boolean;
  /** Total metered calls in the window, and how many were admin-driven. */
  totalCallsLast30d: number;
  totalAdminCallsLast30d: number;
};

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function listBusinessExpenses(): Promise<BusinessExpenseRow[]> {
  const admin = createAdminDbClient();
  const { data } = await admin.database
    .from("business_expenses")
    .select("id,name,category,amount_cents,cadence,created_at")
    .order("created_at", { ascending: false });

  return (
    (data ?? []) as {
      id: string;
      name: string;
      category: string;
      amount_cents: number;
      cadence: ExpenseCadence;
      created_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    amountCents: r.amount_cents,
    cadence: r.cadence,
    createdAt: r.created_at,
  }));
}

// Normalizes every cadence to a monthly-equivalent so the dashboard has one
// comparable "recurring burn" figure — yearly/12, one_time excluded (a
// single past payment isn't a recurring monthly cost, it'd overstate burn).
function totalRecurringMonthly(expenses: BusinessExpenseRow[]): number {
  return expenses.reduce((sum, e) => {
    if (e.cadence === "monthly") return sum + e.amountCents;
    if (e.cadence === "yearly") return sum + e.amountCents / 12;
    return sum;
  }, 0);
}

// Per-action AI/API estimate: hand-maintained ai_cost_rates x real
// usage_daily counts.
//
// This read used to return a structurally-impossible number. Both of its
// inputs were empty — ai_cost_rates lost its seed in the Supabase migration,
// and usage_daily was never written at all because lib/usage.ts returned on
// the ADMIN_EMAILS exemption before metering, while every active account on
// this project is an admin account. Both are fixed (migration
// 20260910230000); what's left here is making the result readable:
//
//   * rateIsSet distinguishes a priced-at-zero action from an unpriced one.
//   * adminCallsLast30d splits owner testing out of what would otherwise
//     look like customer usage.
//
// Still an estimate, not per-call token metering — providers reprice every
// few months and capturing real token counts on every call is not worth the
// instrumentation burden at this scale. The page says so.
export async function getAiCostRates(): Promise<AiCostRateRow[]> {
  const admin = createAdminDbClient();
  const since = daysAgoIso(29);

  const [{ data: rates }, { data: usageRows }] = await Promise.all([
    admin.database.from("ai_cost_rates").select("action,rate_cents_per_call,provider"),
    admin.database.from("usage_daily").select("user_id,action,count").gte("day", since),
  ]);

  const rateByAction = new Map(
    ((rates ?? []) as { action: string; rate_cents_per_call: number; provider: string | null }[]).map((r) => [
      r.action,
      r,
    ]),
  );

  const usage = (usageRows ?? []) as { user_id: string; action: string; count: number }[];

  // One lookup for every user id that actually appears in the window, rather
  // than a join — usage_daily lives beside profiles but PostgREST embedding
  // would need a declared FK, and at this row count the extra query is free.
  const userIds = [...new Set(usage.map((r) => r.user_id))];
  const adminUserIds = new Set<string>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin.database.from("profiles").select("id,email").in("id", userIds);
    for (const p of (profiles ?? []) as { id: string; email: string | null }[]) {
      if (isAdminUser(p.email)) adminUserIds.add(p.id);
    }
  }

  const callsByAction = new Map<string, number>();
  const adminCallsByAction = new Map<string, number>();
  for (const row of usage) {
    callsByAction.set(row.action, (callsByAction.get(row.action) ?? 0) + row.count);
    if (adminUserIds.has(row.user_id)) {
      adminCallsByAction.set(row.action, (adminCallsByAction.get(row.action) ?? 0) + row.count);
    }
  }

  const actions = Object.keys(ACTION_LABELS) as UsageAction[];

  return actions
    .map((action) => {
      const rate = rateByAction.get(action);
      const rateCentsPerCall = rate ? Number(rate.rate_cents_per_call) : 0;
      const callsLast30d = callsByAction.get(action) ?? 0;
      return {
        action,
        label: ACTION_LABELS[action],
        rateCentsPerCall,
        provider: rate?.provider ?? null,
        rateIsSet: Boolean(rate),
        callsLast30d,
        adminCallsLast30d: adminCallsByAction.get(action) ?? 0,
        estCostCentsLast30d: rateCentsPerCall * callsLast30d,
      };
    })
    .sort((a, b) => b.estCostCentsLast30d - a.estCostCentsLast30d || b.callsLast30d - a.callsLast30d);
}

export async function getExpensesSummary(): Promise<ExpensesSummary> {
  const [expenses, aiCostRates, vendors] = await Promise.all([
    listBusinessExpenses(),
    getAiCostRates(),
    getVendorCosts(),
  ]);

  const measured = vendors.filter((v) => v.measured && v.spendCents !== null);

  return {
    expenses,
    aiCostRates,
    vendors,
    totalRecurringMonthlyCents: totalRecurringMonthly(expenses),
    totalAiCostCentsLast30d: aiCostRates.reduce((sum, r) => sum + r.estCostCentsLast30d, 0),
    totalMeasuredVendorCents: measured.reduce((sum, v) => sum + (v.spendCents ?? 0), 0),
    anyVendorMeasured: measured.length > 0,
    totalCallsLast30d: aiCostRates.reduce((sum, r) => sum + r.callsLast30d, 0),
    totalAdminCallsLast30d: aiCostRates.reduce((sum, r) => sum + r.adminCallsLast30d, 0),
  };
}
