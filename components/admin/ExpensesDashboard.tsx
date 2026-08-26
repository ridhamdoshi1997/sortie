"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { addBusinessExpense, getExpensesPage, removeBusinessExpense, updateAiCostRate } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminRole } from "@/lib/admin/auth";
import type { AiCostRateRow, BusinessExpenseRow, ExpenseCadence, ExpensesSummary } from "@/lib/admin/expenses";

const CADENCE_LABELS: Record<ExpenseCadence, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
  one_time: "One-time",
};

function formatCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars !== 0 && Math.abs(dollars) < 1) {
    return `$${dollars.toFixed(3)}`;
  }
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Expenses (admin console expansion item 1, context/RESUME.md) — two
// halves on one page: hand-entered business_expenses (real costs an admin
// types in) and the hand-maintained ai_cost_rates estimate joined against
// usage_daily's existing counts. Same requireRole gating as the rest of
// /admin: owner+admin can add/remove expenses, only owner can tune rates
// (matches the AI kill switch's blast-radius-large gating).
export function ExpensesDashboard({ initialData, viewerRole }: { initialData: ExpensesSummary; viewerRole: AdminRole }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<BusinessExpenseRow | null>(null);

  const canWrite = viewerRole === "owner" || viewerRole === "admin";
  const isOwner = viewerRole === "owner";
  const estMonthlyBurnCents = data.totalRecurringMonthlyCents + data.totalAiCostCentsLast30d;

  function refresh(): void {
    startTransition(async () => {
      const result = await getExpensesPage();
      if (result.success) setData(result.data);
    });
  }

  function handleDelete(id: string): void {
    setError(null);
    startTransition(async () => {
      const result = await removeBusinessExpense(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmTarget(null);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Recurring expenses" value={formatCents(data.totalRecurringMonthlyCents)} sub="normalized to monthly" />
        <StatCard label="Est. AI/API cost" value={formatCents(data.totalAiCostCentsLast30d)} sub="last 30 days, app-wide" />
        <StatCard label="Est. monthly burn" value={formatCents(estMonthlyBurnCents)} sub="recurring + AI/API (30d)" />
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <ExpensesTable
        expenses={data.expenses}
        canWrite={canWrite}
        isPending={isPending}
        onAdded={refresh}
        onDeleteRequest={setConfirmTarget}
      />

      <AiCostRatesTable rates={data.aiCostRates} canEdit={isOwner} onUpdated={refresh} setError={setError} />

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Remove this expense?"
        description={`"${confirmTarget?.name}" will be removed from the expenses list. This can't be undone.`}
        confirmLabel="Remove"
        pending={isPending}
        onConfirm={() => confirmTarget && handleDelete(confirmTarget.id)}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-3 font-mono text-3xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </div>
  );
}

function ExpensesTable({
  expenses,
  canWrite,
  isPending,
  onAdded,
  onDeleteRequest,
}: {
  expenses: BusinessExpenseRow[];
  canWrite: boolean;
  isPending: boolean;
  onAdded: () => void;
  onDeleteRequest: (expense: BusinessExpenseRow) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<ExpenseCadence>("monthly");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setFormError(null);
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      setFormError("Enter a valid amount.");
      return;
    }
    startTransition(async () => {
      const result = await addBusinessExpense(name, category, amountCents, cadence);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setName("");
      setCategory("");
      setAmount("");
      setCadence("monthly");
      onAdded();
    });
  }

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <h2 className="text-base font-semibold text-text-primary">Business expenses</h2>

      {canWrite && (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-2 border-b border-border pb-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Vercel Pro"
              required
              className="h-9 w-40 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Hosting"
              className="h-9 w-32 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Amount ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="h-9 w-24 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Cadence</label>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as ExpenseCadence)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="one_time">One-time</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-signal h-9 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            Add
          </button>
        </form>
      )}
      {formError && <p className="mt-2 text-xs text-error">{formError}</p>}

      {expenses.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No expenses logged yet.</p>
      ) : (
        // Same Operate-mode density as SupportInbox.tsx/UsersTable.tsx
        // (Phase 26, admin-redesign Phase 2) — sticky header, tighter rows,
        // row-hover.
        <div className="mt-4 max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-surface-secondary">
                {["Name", "Category", "Amount", "Cadence", "Added", ""].map((h) => (
                  <th key={h} className="px-5 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-t border-border transition-colors hover:bg-surface-secondary/60">
                  <td className="px-5 py-2.5 text-text-primary">{e.name}</td>
                  <td className="px-5 py-2.5 text-text-secondary">{e.category}</td>
                  <td className="px-5 py-2.5 font-mono text-text-primary">{formatCents(e.amountCents)}</td>
                  <td className="px-5 py-2.5 text-text-secondary">{CADENCE_LABELS[e.cadence]}</td>
                  <td className="px-5 py-2.5 font-mono text-text-secondary">{formatDate(e.createdAt)}</td>
                  <td className="px-5 py-2.5">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => onDeleteRequest(e)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-error hover:underline disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AiCostRatesTable({
  rates,
  canEdit,
  onUpdated,
  setError,
}: {
  rates: AiCostRateRow[];
  canEdit: boolean;
  onUpdated: () => void;
  setError: (error: string | null) => void;
}) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <h2 className="text-base font-semibold text-text-primary">AI / API cost estimate</h2>
      <p className="mt-1 text-xs text-text-muted">
        Hand-maintained $ rate per call, joined against real usage counts — an estimate, not per-call token metering.
        {canEdit ? " Update a rate as providers reprice." : " Only an owner can update rates."}
      </p>

      <div className="mt-4 max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 bg-surface-secondary">
              {["Action", "Provider", "Rate / call", "Calls (30d)", "Est. cost (30d)", ""].map((h) => (
                <th key={h} className="px-5 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <RateRow key={r.action} rate={r} canEdit={canEdit} onUpdated={onUpdated} setError={setError} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RateRow({
  rate,
  canEdit,
  onUpdated,
  setError,
}: {
  rate: AiCostRateRow;
  canEdit: boolean;
  onUpdated: () => void;
  setError: (error: string | null) => void;
}) {
  const [rateInput, setRateInput] = useState(String(rate.rateCentsPerCall));
  const [providerInput, setProviderInput] = useState(rate.provider ?? "");
  const [isPending, startTransition] = useTransition();

  const dirty = rateInput !== String(rate.rateCentsPerCall) || providerInput !== (rate.provider ?? "");

  function save(): void {
    const value = Number(rateInput);
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter a valid non-negative rate.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateAiCostRate(rate.action, value, providerInput);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onUpdated();
    });
  }

  return (
    <tr className="border-t border-border transition-colors hover:bg-surface-secondary/60">
      <td className="px-5 py-3 text-text-primary">{rate.label}</td>
      <td className="px-5 py-3">
        {canEdit ? (
          <input
            value={providerInput}
            onChange={(e) => setProviderInput(e.target.value)}
            className="h-8 w-44 rounded-md border border-border bg-surface px-2 text-xs text-text-primary outline-none focus-visible:border-accent"
          />
        ) : (
          <span className="text-text-secondary">{rate.provider ?? "—"}</span>
        )}
      </td>
      <td className="px-5 py-3">
        {canEdit ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-muted">¢</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className="h-8 w-20 rounded-md border border-border bg-surface px-2 font-mono text-xs text-text-primary outline-none focus-visible:border-accent"
            />
          </div>
        ) : (
          <span className="font-mono text-text-primary">{rate.rateCentsPerCall}¢</span>
        )}
      </td>
      <td className="px-5 py-3 font-mono text-text-secondary">{rate.callsLast30d}</td>
      <td className="px-5 py-3 font-mono text-text-primary">{formatCents(rate.estCostCentsLast30d)}</td>
      <td className="px-5 py-3">
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={isPending || !dirty}
            className="h-7 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Save
          </button>
        )}
      </td>
    </tr>
  );
}
