import { createAdminDbClient } from "@/lib/admin/client";
import { ACTION_LABELS, type UsageAction } from "@/lib/usage";

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
  callsLast30d: number;
  estCostCentsLast30d: number;
};

export type ExpensesSummary = {
  expenses: BusinessExpenseRow[];
  aiCostRates: AiCostRateRow[];
  totalRecurringMonthlyCents: number;
  totalAiCostCentsLast30d: number;
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

// Estimate, not real per-call token metering (see the migration's own
// comment) — joins usage_daily's existing app-wide per-action counts
// against the hand-maintained ai_cost_rates table. Every UsageAction is
// listed even when it has no seeded rate (rate defaults to 0), so the free
// Gemini-tier actions show up honestly as $0 rather than being silently
// omitted from the table.
export async function getAiCostRates(): Promise<AiCostRateRow[]> {
  const admin = createAdminDbClient();
  const since = daysAgoIso(29);

  const [{ data: rates }, { data: usageRows }] = await Promise.all([
    admin.database.from("ai_cost_rates").select("action,rate_cents_per_call,provider"),
    admin.database.from("usage_daily").select("action,count").gte("day", since),
  ]);

  const rateByAction = new Map(
    ((rates ?? []) as { action: string; rate_cents_per_call: number; provider: string | null }[]).map((r) => [
      r.action,
      r,
    ]),
  );

  const callsByAction = new Map<string, number>();
  for (const row of (usageRows ?? []) as { action: string; count: number }[]) {
    callsByAction.set(row.action, (callsByAction.get(row.action) ?? 0) + row.count);
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
        callsLast30d,
        estCostCentsLast30d: rateCentsPerCall * callsLast30d,
      };
    })
    .sort((a, b) => b.estCostCentsLast30d - a.estCostCentsLast30d);
}

export async function getExpensesSummary(): Promise<ExpensesSummary> {
  const [expenses, aiCostRates] = await Promise.all([listBusinessExpenses(), getAiCostRates()]);

  return {
    expenses,
    aiCostRates,
    totalRecurringMonthlyCents: totalRecurringMonthly(expenses),
    totalAiCostCentsLast30d: aiCostRates.reduce((sum, r) => sum + r.estCostCentsLast30d, 0),
  };
}
