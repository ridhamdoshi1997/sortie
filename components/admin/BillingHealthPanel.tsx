import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";

import type { BillingHealth } from "@/lib/admin/billingHealth";
import type { HealthStatus } from "@/lib/systemHealth";

// The business view /admin/billing never had (Phase 52, section 6). Sits
// ABOVE the plan editor, which is deliberately untouched — this is a new
// panel, not a rewrite.
//
// A server component: every value is read-only and computed server-side.

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

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const hours = Math.round((Date.now() - d.getTime()) / 3_600_000);
  const ago = hours < 1 ? "just now" : hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} (${ago})`;
}

export function BillingHealthPanel({ health }: { health: BillingHealth }) {
  const isTest = health.stripe.mode === "test";

  return (
    <div className="flex flex-col gap-4">
      {/* Test mode is stated first and loudest. Everything below it is
          fixtures, not customers, and a reader who misses that would draw
          exactly the wrong conclusion about the business. */}
      {health.stripe.configured && isTest && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <p className="text-sm font-medium text-warning">Stripe is in TEST mode</p>
          <p className="mt-1 text-xs text-text-secondary">
            Everything below comes from test fixtures, not real customers. MRR is deliberately not calculated — multiplying
            a plan price by a count of test subscriptions produces a number that looks like revenue and is not.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active subscribers" value={String(health.totalActive)} sub="local projection" />
        <Stat
          label="MRR"
          value={health.mrrCents === null ? "—" : formatCents(health.mrrCents)}
          sub={health.mrrCents === null ? "withheld outside live mode" : "from active subscriptions"}
        />
        <Stat
          label="Failed payments"
          value={String(health.pastDue)}
          sub="past due or unpaid"
          alert={health.pastDue > 0}
        />
        <Stat label="Cancelled / 30d" value={String(health.canceledThisPeriod)} sub={`${health.trialing} trialing`} />
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center gap-2">
          <StatusIcon status={health.status} />
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
            Stripe sync
          </h2>
        </div>

        {!health.stripe.configured ? (
          <p className="mt-3 text-sm text-text-muted">{health.stripe.error}</p>
        ) : !health.stripe.reachable ? (
          <p className="mt-3 text-sm text-error">Stripe unreachable — {health.stripe.error}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5 text-sm">
            <p className="text-text-secondary">
              Stripe reports{" "}
              <span className="font-mono text-text-primary">{health.stripe.activeSubscriptions}</span> active and{" "}
              <span className="font-mono text-text-primary">{health.stripe.canceledSubscriptions}</span> cancelled
              subscriptions.
            </p>
            <p className="text-text-secondary">
              Last webhook-eligible event:{" "}
              <span className="font-mono text-text-primary">{health.stripe.lastEventType ?? "none"}</span>{" "}
              <span className="text-text-muted">{formatWhen(health.stripe.lastEventAt)}</span>
            </p>
            <p className="text-xs text-text-muted">
              Read from Stripe&apos;s own Events API, which retains 30 days — not from a local webhook log, which would
              only ever be as reliable as the webhook it was recording.
            </p>
          </div>
        )}

        {health.driftWarning && (
          <p className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            {health.driftWarning}
          </p>
        )}

        {health.unlinkedLocalSubs > 0 && (
          <p className="mt-2 text-xs text-text-muted">
            {health.unlinkedLocalSubs} active local subscription{health.unlinkedLocalSubs === 1 ? " carries" : "s carry"} no
            Stripe subscription id — granted by hand rather than bought. Expected for comps and testing; it means they will
            never renew, churn, or fail a payment through Stripe.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
          Subscribers by tier
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-surface-secondary">
                {["Plan", "Price", "Active", "MRR contribution"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {health.byTier.map((r) => (
                <tr key={r.tier} className="border-t border-border">
                  <td className="px-4 py-2.5 text-text-primary">{r.displayName}</td>
                  <td className="px-4 py-2.5 font-mono text-text-secondary">{formatCents(r.priceCents)}</td>
                  <td className="px-4 py-2.5 font-mono text-text-primary">{r.activeCount}</td>
                  <td className="px-4 py-2.5 font-mono text-text-secondary">
                    {isTest ? "—" : formatCents(r.mrrCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border p-6 shadow-card ${alert ? "border-warning/30 bg-warning/5" : "border-border bg-surface"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-3 font-mono text-3xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </div>
  );
}
