"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Trash2, XCircle } from "lucide-react";

import { addBusinessExpense, getExpensesPage, removeBusinessExpense, updateAiCostRate } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminRole } from "@/lib/admin/auth";
import type { AiCostRateRow, BusinessExpenseRow, ExpenseCadence, ExpensesSummary } from "@/lib/admin/expenses";
import type { VendorCostLine } from "@/lib/admin/vendorCosts";
import type { HealthStatus } from "@/lib/systemHealth";

// Same vocabulary as SystemHealthPanel — the two pages report on the same
// vendors and an operator should not have to learn two colour languages.
const STATUS_STYLES: Record<HealthStatus, { cls: string; label: string }> = {
  ok: { cls: "text-success", label: "OK" },
  warn: { cls: "text-warning", label: "Attention" },
  down: { cls: "text-error", label: "Down" },
  unknown: { cls: "text-text-muted", label: "Unknown" },
};

function StatusIcon({ status }: { status: HealthStatus }) {
  const cls = `h-4 w-4 shrink-0 ${STATUS_STYLES[status].cls}`;
  if (status === "ok") return <CheckCircle2 className={cls} />;
  if (status === "warn") return <AlertTriangle className={cls} />;
  if (status === "down") return <XCircle className={cls} />;
  return <HelpCircle className={cls} />;
}

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

// Expenses. Three clearly separated halves-of-a-whole, because the page's
// original sin was presenting one blended number as if it were all computed
// (Phase 52, section 2):
//
//   1. MEASURED — vendor spend read live from the vendor's own API this
//      request. Today that is Apify, the only vendor billing real variable
//      money. This is not an estimate and is labelled so.
//   2. ESTIMATED — ai_cost_rates x usage_daily. A hand-maintained rate
//      times a real call count. Honest about being an estimate, and about
//      how much of the usage is the owner's own testing.
//   3. ENTERED — business_expenses, typed in by an admin. Nothing measured
//      about it at all.
//
// Same requireRole gating as the rest of /admin: owner+admin can add/remove
// expenses, only owner can tune rates (matches the AI kill switch's
// blast-radius-large gating).
export function ExpensesDashboard({ initialData, viewerRole }: { initialData: ExpensesSummary; viewerRole: AdminRole }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmTarget, setConfirmTarget] = useState<BusinessExpenseRow | null>(null);

  const canWrite = viewerRole === "owner" || viewerRole === "admin";
  const isOwner = viewerRole === "owner";
  // Deliberately sums all three sources, and the card says so — a "burn"
  // figure that quietly omitted measured vendor spend was most of what made
  // the old page wrong.
  const estMonthlyBurnCents =
    data.totalRecurringMonthlyCents + data.totalAiCostCentsLast30d + data.totalMeasuredVendorCents;
  const adminSharePct =
    data.totalCallsLast30d > 0 ? Math.round((data.totalAdminCallsLast30d / data.totalCallsLast30d) * 100) : 0;

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Measured vendor spend"
          value={data.anyVendorMeasured ? formatCents(data.totalMeasuredVendorCents) : "—"}
          sub={data.anyVendorMeasured ? "read live from the vendor, current cycle" : "no vendor exposed a figure"}
          tone="measured"
        />
        <StatCard
          label="Est. AI/API cost"
          value={formatCents(data.totalAiCostCentsLast30d)}
          sub={`estimate — ${data.totalCallsLast30d} metered call${data.totalCallsLast30d === 1 ? "" : "s"} in 30d`}
          tone="estimate"
        />
        <StatCard
          label="Fixed costs"
          value={formatCents(data.totalRecurringMonthlyCents)}
          sub="entered by hand, normalized to monthly"
          tone="entered"
        />
        <StatCard
          label="Approx. monthly burn"
          value={formatCents(estMonthlyBurnCents)}
          sub="measured + estimated + entered"
          tone="estimate"
        />
      </div>

      {/* The single most important caveat on this page. Pre-launch, nearly
          all metered usage is the owner's own testing, and a reader who
          mistook it for customer demand would draw exactly the wrong
          conclusion. Shown only when there is usage to qualify. */}
      {data.totalCallsLast30d > 0 && adminSharePct > 0 && (
        <p className="rounded-lg border border-border bg-surface-secondary/60 px-4 py-2.5 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">{adminSharePct}% of metered calls</span> in this window came from
          admin accounts ({data.totalAdminCallsLast30d} of {data.totalCallsLast30d}). Admins are uncapped but are metered —
          the dollars are real either way, but this is testing, not customer demand.
        </p>
      )}

      {error && <p className="text-xs text-error">{error}</p>}

      <VendorCostsTable vendors={data.vendors} />

      <AiCostRatesTable rates={data.aiCostRates} canEdit={isOwner} onUpdated={refresh} setError={setError} />

      <ExpensesTable
        expenses={data.expenses}
        canWrite={canWrite}
        isPending={isPending}
        onAdded={refresh}
        onDeleteRequest={setConfirmTarget}
      />

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

// The tone chip is the whole point of the redesign: at a glance, which of
// these numbers is a measurement and which is somebody's estimate.
const TONE_LABELS: Record<"measured" | "estimate" | "entered", string> = {
  measured: "Measured",
  estimate: "Estimate",
  entered: "Entered",
};

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "measured" | "estimate" | "entered";
}) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            tone === "measured" ? "bg-success/10 text-success" : "bg-surface-secondary text-text-muted"
          }`}
        >
          {TONE_LABELS[tone]}
        </span>
      </div>
      <p className="mt-3 font-mono text-3xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </div>
  );
}

function VendorCostsTable({ vendors }: { vendors: VendorCostLine[] }) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <h2 className="text-base font-semibold text-text-primary">Vendors</h2>
      <p className="mt-1 text-xs text-text-muted">
        Every external service this project pays or could pay, including the background work no UsageAction covers — the
        crawl crons and the daily news ingestion. A row is marked{" "}
        <span className="font-medium text-success">Measured</span> only when the figure came back from that vendor&apos;s own
        API on this page load; everything else says what it is instead of showing a zero it did not verify.
      </p>

      <div className="mt-4 max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 bg-surface-secondary">
              {["Vendor", "Plan", "Billed on", "Spend", ""].map((h) => (
                <th
                  key={h}
                  className="px-5 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => {
              const pct =
                v.spendCents !== null && v.capCents !== null && v.capCents > 0
                  ? Math.round((v.spendCents / v.capCents) * 100)
                  : null;
              return (
                <tr key={v.key} className="border-t border-border align-top transition-colors hover:bg-surface-secondary/60">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={v.status} />
                      <span className="font-medium text-text-primary">{v.name}</span>
                      {v.measured && (
                        <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
                          Measured
                        </span>
                      )}
                    </div>
                    <p className="mt-1 max-w-md text-xs text-text-muted">{v.detail}</p>
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{v.plan}</td>
                  <td className="px-5 py-3 text-xs text-text-secondary">{v.billedOn}</td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-text-primary">
                      {v.spendCents === null ? "—" : formatCents(v.spendCents)}
                    </span>
                    {v.capCents !== null && v.capCents > 0 && (
                      <span className="ml-1 font-mono text-xs text-text-muted">of {formatCents(v.capCents)}</span>
                    )}
                    {pct !== null && (
                      <p className={`mt-0.5 text-xs ${pct >= 90 ? "text-error" : pct >= 70 ? "text-warning" : "text-text-muted"}`}>
                        {pct}% of the cycle&apos;s free credit used
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-text-muted">
                    {v.cycleEndsOn ? `resets ${formatDate(v.cycleEndsOn)}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
      <h2 className="text-base font-semibold text-text-primary">Per-action AI / API estimate</h2>
      <p className="mt-1 text-xs text-text-muted">
        A hand-maintained $ rate per call multiplied by a real usage count — an estimate, not per-call token metering, since
        providers reprice every few months. Most actions run on the free-tier Gemini key and genuinely cost nothing; an action
        showing <span className="font-medium text-warning">no rate set</span> is unpriced rather than free.
        {canEdit ? " Update a rate as providers reprice." : " Only an owner can update rates."}
      </p>

      <div className="mt-4 max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
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
      <td className="px-5 py-3 text-text-primary">
        {rate.label}
        {!rate.rateIsSet && (
          <span className="ml-2 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
            No rate set
          </span>
        )}
      </td>
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
      <td className="px-5 py-3 font-mono text-text-secondary">
        {rate.callsLast30d}
        {rate.adminCallsLast30d > 0 && (
          <span className="ml-1 text-[10px] font-normal text-text-muted">({rate.adminCallsLast30d} admin)</span>
        )}
      </td>
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
