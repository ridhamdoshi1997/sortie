"use client";

import { useState, useTransition } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { createPlan, deletePlan, updatePlan, type PlanInput } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ACTION_LABELS, DAILY_LIMITS, type UsageAction } from "@/lib/usage";
import { REGION_LABELS, type RegionKey, defaultCurrencyForRegion } from "@/lib/regionalPricing";
import type { PlanConfig } from "@/lib/subscription";

// Country/region-aware pricing (direct user request, 2026-08-28) — the
// known region-key set the admin editor renders rows for. Fixed (not
// derived from the plan's own regional_prices, which starts empty on every
// plan) so every plan's form shows the same rows, same reasoning ACTION_KEYS
// already established for DailyActionLimitsEditor.
const REGION_KEYS = Object.keys(REGION_LABELS) as RegionKey[];

// One text field per lib/usage.ts action (direct user request, 2026-08-28,
// "full ability to control all the features and limits" from the admin
// panel) — blank = no override (falls back to DAILY_LIMITS), the literal
// word "unlimited" = null override, otherwise parsed as a number. Kept as
// free text rather than a number input + separate "unlimited" checkbox per
// row — 29 rows of two controls each would roughly double this section's
// height for a distinction a single keyword already expresses clearly.
const ACTION_KEYS = Object.keys(DAILY_LIMITS) as UsageAction[];

type DraftPlan = {
  tier: string;
  displayName: string;
  priceCents: number;
  billingPeriod: "month" | "year" | "lifetime";
  insiderConnectionsMonthlyLimit: number;
  companyResearchMonthlyLimit: number;
  emailLookupMonthlyLimit: number;
  jobEvaluationsDailyLimitInput: string; // "" means unlimited (null)
  dailyActionLimitsInput: Record<string, string>; // "" = default, "unlimited" = null, else a number
  // Country/region-aware pricing (direct user request, 2026-08-28) — blank
  // priceInput = no override for that region, falls back to the plan's
  // base price/Stripe Price ID above. Same string-sentinel convention
  // dailyActionLimitsInput already established.
  regionalPricesInput: Record<RegionKey, { priceInput: string; currency: string; stripePriceIdInput: string }>;
  llmUnlocked: boolean;
  featureBulletsText: string; // one bullet per line
  stripePriceId: string;
  maxSeatsInput: string; // "" means unlimited (null)
  seatsClaimed: number; // read-only, display only — never sent back to the server
};

function toDraft(plan: PlanConfig): DraftPlan {
  return {
    tier: plan.tier,
    displayName: plan.displayName,
    priceCents: plan.priceCents,
    billingPeriod: plan.billingPeriod,
    insiderConnectionsMonthlyLimit: plan.insiderConnectionsMonthlyLimit,
    companyResearchMonthlyLimit: plan.companyResearchMonthlyLimit,
    emailLookupMonthlyLimit: plan.emailLookupMonthlyLimit,
    jobEvaluationsDailyLimitInput: plan.jobEvaluationsDailyLimit === null ? "" : String(plan.jobEvaluationsDailyLimit),
    dailyActionLimitsInput: Object.fromEntries(
      ACTION_KEYS.map((action) => {
        const override = plan.dailyActionLimits[action];
        return [action, override === undefined ? "" : override === null ? "unlimited" : String(override)];
      }),
    ),
    regionalPricesInput: Object.fromEntries(
      REGION_KEYS.map((region) => {
        const override = plan.regionalPrices[region];
        return [
          region,
          {
            priceInput: override ? (override.priceCents / 100).toFixed(2) : "",
            currency: override?.currency ?? defaultCurrencyForRegion(region),
            stripePriceIdInput: override?.stripePriceId ?? "",
          },
        ];
      }),
    ) as DraftPlan["regionalPricesInput"],
    llmUnlocked: plan.llmUnlocked,
    featureBulletsText: plan.featureBullets.join("\n"),
    stripePriceId: plan.stripePriceId ?? "",
    maxSeatsInput: plan.maxSeats === null ? "" : String(plan.maxSeats),
    seatsClaimed: plan.seatsClaimed,
  };
}

function parseDailyActionLimits(input: Record<string, string>): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [action, raw] of Object.entries(input)) {
    const trimmed = raw.trim();
    if (trimmed === "") continue; // no override — falls back to DAILY_LIMITS
    if (trimmed.toLowerCase() === "unlimited") {
      result[action] = null;
      continue;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) result[action] = Math.max(0, Math.round(parsed));
  }
  return result;
}

function parseRegionalPrices(
  input: Record<RegionKey, { priceInput: string; currency: string; stripePriceIdInput: string }>,
): Record<string, { priceCents: number; currency: string; stripePriceId: string | null }> {
  const result: Record<string, { priceCents: number; currency: string; stripePriceId: string | null }> = {};
  for (const [region, { priceInput, currency, stripePriceIdInput }] of Object.entries(input)) {
    const trimmed = priceInput.trim();
    if (trimmed === "") continue; // no override — falls back to the plan's base price
    const priceCents = Math.max(0, Math.round(Number(trimmed) * 100));
    if (!Number.isFinite(priceCents)) continue;
    result[region] = { priceCents, currency: currency.trim().toLowerCase() || "usd", stripePriceId: stripePriceIdInput.trim() || null };
  }
  return result;
}

function draftToInput(draft: DraftPlan): Omit<PlanInput, "tier"> {
  return {
    displayName: draft.displayName,
    priceCents: draft.priceCents,
    billingPeriod: draft.billingPeriod,
    insiderConnectionsMonthlyLimit: draft.insiderConnectionsMonthlyLimit,
    companyResearchMonthlyLimit: draft.companyResearchMonthlyLimit,
    emailLookupMonthlyLimit: draft.emailLookupMonthlyLimit,
    jobEvaluationsDailyLimit: draft.jobEvaluationsDailyLimitInput.trim() === "" ? null : Number(draft.jobEvaluationsDailyLimitInput),
    dailyActionLimits: parseDailyActionLimits(draft.dailyActionLimitsInput),
    regionalPrices: parseRegionalPrices(draft.regionalPricesInput),
    llmUnlocked: draft.llmUnlocked,
    featureBullets: draft.featureBulletsText.split("\n").map((b) => b.trim()).filter(Boolean),
    stripePriceId: draft.stripePriceId.trim() || null,
    maxSeats: draft.maxSeatsInput.trim() === "" ? null : Number(draft.maxSeatsInput),
  };
}

const EMPTY_DRAFT: DraftPlan = {
  tier: "",
  displayName: "",
  priceCents: 0,
  billingPeriod: "month",
  insiderConnectionsMonthlyLimit: 0,
  companyResearchMonthlyLimit: 0,
  emailLookupMonthlyLimit: 10,
  jobEvaluationsDailyLimitInput: "3",
  dailyActionLimitsInput: Object.fromEntries(ACTION_KEYS.map((action) => [action, ""])),
  regionalPricesInput: Object.fromEntries(
    REGION_KEYS.map((region) => [region, { priceInput: "", currency: defaultCurrencyForRegion(region), stripePriceIdInput: "" }]),
  ) as DraftPlan["regionalPricesInput"],
  llmUnlocked: false,
  featureBulletsText: "",
  stripePriceId: "",
  maxSeatsInput: "",
  seatsClaimed: 0,
};

function DailyActionLimitsEditor({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const overrideCount = Object.values(values).filter((v) => v.trim() !== "").length;

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-text-muted hover:text-text-secondary"
      >
        Per-action daily limits {overrideCount > 0 && `(${overrideCount} overridden)`} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="grid gap-2 rounded-lg border border-border bg-surface-secondary p-3 sm:grid-cols-2">
          {ACTION_KEYS.map((action) => (
            <div key={action} className="flex items-center gap-2">
              <label className="min-w-0 flex-1 truncate text-[11px] text-text-secondary" title={ACTION_LABELS[action]}>
                {ACTION_LABELS[action]}
                <span className="text-text-muted"> (default {DAILY_LIMITS[action]}/day)</span>
              </label>
              <input
                value={values[action] ?? ""}
                onChange={(e) => onChange({ ...values, [action]: e.target.value })}
                placeholder="default"
                className="h-7 w-24 shrink-0 rounded-md border border-border bg-surface px-2 text-[11px] text-text-primary outline-none focus-visible:border-accent"
              />
            </div>
          ))}
          <p className="sm:col-span-2 text-[10px] text-text-muted">
            Blank = plan uses the app-wide default shown above. Type a number to override, or &quot;unlimited&quot; for no cap.
          </p>
        </div>
      )}
    </div>
  );
}

function RegionalPricingEditor({
  values,
  onChange,
}: {
  values: Record<RegionKey, { priceInput: string; currency: string; stripePriceIdInput: string }>;
  onChange: (values: Record<RegionKey, { priceInput: string; currency: string; stripePriceIdInput: string }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const configuredCount = Object.values(values).filter((v) => v.priceInput.trim() !== "").length;

  return (
    <div className="sm:col-span-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-text-muted hover:text-text-secondary"
      >
        Regional pricing {configuredCount > 0 && `(${configuredCount} configured)`} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-secondary p-3">
          {REGION_KEYS.map((region) => {
            const row = values[region] ?? { priceInput: "", currency: "usd", stripePriceIdInput: "" };
            return (
              <div key={region} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <label className="min-w-0 truncate text-[11px] text-text-secondary" title={REGION_LABELS[region]}>
                  {REGION_LABELS[region]}
                </label>
                <input
                  value={row.priceInput}
                  onChange={(e) => onChange({ ...values, [region]: { ...row, priceInput: e.target.value } })}
                  placeholder="base price"
                  className="h-7 w-20 shrink-0 rounded-md border border-border bg-surface px-2 text-[11px] text-text-primary outline-none focus-visible:border-accent"
                />
                <input
                  value={row.currency}
                  onChange={(e) => onChange({ ...values, [region]: { ...row, currency: e.target.value } })}
                  placeholder="usd"
                  className="h-7 w-14 shrink-0 rounded-md border border-border bg-surface px-2 text-[11px] uppercase text-text-primary outline-none focus-visible:border-accent"
                />
                <input
                  value={row.stripePriceIdInput}
                  onChange={(e) => onChange({ ...values, [region]: { ...row, stripePriceIdInput: e.target.value } })}
                  placeholder="price_... (Stripe Price for this region)"
                  className="col-span-3 h-7 w-full rounded-md border border-border bg-surface px-2 font-mono text-[11px] text-text-primary outline-none focus-visible:border-accent"
                />
              </div>
            );
          })}
          <p className="text-[10px] text-text-muted">
            Blank price = this region falls back to the plan&apos;s base USD price above. A price with no Stripe Price ID
            shows on /pricing but isn&apos;t checkout-able yet — create the real Price in Stripe first (test mode while
            building), then paste its ID here.
          </p>
        </div>
      )}
    </div>
  );
}

function PlanForm({
  draft,
  isNew,
  onChange,
  onSave,
  onDelete,
  pending,
}: {
  draft: DraftPlan;
  isNew: boolean;
  onChange: (draft: DraftPlan) => void;
  onSave: () => void;
  onDelete?: () => void;
  pending: boolean;
}) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {isNew && (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Slug (permanent)</label>
            <input
              value={draft.tier}
              onChange={(e) => onChange({ ...draft, tier: e.target.value.toLowerCase() })}
              placeholder="e.g. enterprise"
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Display name</label>
          <input
            value={draft.displayName}
            onChange={(e) => onChange({ ...draft, displayName: e.target.value })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Price (USD/period)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={(draft.priceCents / 100).toFixed(2)}
            onChange={(e) => onChange({ ...draft, priceCents: Math.round(Number(e.target.value) * 100) })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Billing period</label>
          <select
            value={draft.billingPeriod}
            onChange={(e) => onChange({ ...draft, billingPeriod: e.target.value as "month" | "year" | "lifetime" })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          >
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="lifetime">One-time (lifetime)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">
            Max seats (blank = unlimited)
          </label>
          <input
            type="number"
            min="0"
            value={draft.maxSeatsInput}
            onChange={(e) => onChange({ ...draft, maxSeatsInput: e.target.value })}
            placeholder="Unlimited"
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          {!isNew && draft.maxSeatsInput.trim() !== "" && (
            <p className="mt-1 text-[11px] text-text-muted">
              {draft.seatsClaimed} / {draft.maxSeatsInput} seats claimed — this count only changes from real Stripe purchases, not this form.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Insider connections / month</label>
          <input
            type="number"
            min="0"
            value={draft.insiderConnectionsMonthlyLimit}
            onChange={(e) => onChange({ ...draft, insiderConnectionsMonthlyLimit: Math.max(0, Number(e.target.value)) })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Company research / month</label>
          <input
            type="number"
            min="0"
            value={draft.companyResearchMonthlyLimit}
            onChange={(e) => onChange({ ...draft, companyResearchMonthlyLimit: Math.max(0, Number(e.target.value)) })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Email lookups / month</label>
          <input
            type="number"
            min="0"
            value={draft.emailLookupMonthlyLimit}
            onChange={(e) => onChange({ ...draft, emailLookupMonthlyLimit: Math.max(0, Number(e.target.value)) })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Job evaluations / day (blank = unlimited)</label>
          <input
            type="number"
            min="0"
            value={draft.jobEvaluationsDailyLimitInput}
            onChange={(e) => onChange({ ...draft, jobEvaluationsDailyLimitInput: e.target.value })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={draft.llmUnlocked}
              onChange={(e) => onChange({ ...draft, llmUnlocked: e.target.checked })}
              className="h-4 w-4 rounded border-border accent-[var(--color-accent)]"
            />
            Unlocks GPT-4o / Claude
          </label>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Stripe Price ID (blank = not checkout-able)</label>
          <input
            value={draft.stripePriceId}
            onChange={(e) => onChange({ ...draft, stripePriceId: e.target.value })}
            placeholder="price_..."
            className="h-9 w-full rounded-md border border-border bg-surface px-3 font-mono text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Marketing bullets (one per line)</label>
          <textarea
            value={draft.featureBulletsText}
            onChange={(e) => onChange({ ...draft, featureBulletsText: e.target.value })}
            rows={3}
            className="w-full rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <DailyActionLimitsEditor
          values={draft.dailyActionLimitsInput}
          onChange={(values) => onChange({ ...draft, dailyActionLimitsInput: values })}
        />
        <RegionalPricingEditor
          values={draft.regionalPricesInput}
          onChange={(values) => onChange({ ...draft, regionalPricesInput: values })}
        />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-60"
          >
            <Trash2 className="h-3 w-3" />
            Delete plan
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !draft.displayName.trim() || (isNew && !draft.tier.trim())}
          className="btn-signal inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-60"
        >
          <Save className="h-3 w-3" />
          {isNew ? "Create plan" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

export function PlansManager({ initialPlans }: { initialPlans: PlanConfig[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [drafts, setDrafts] = useState<Record<string, DraftPlan>>(
    Object.fromEntries(initialPlans.map((p) => [p.tier, toDraft(p)])),
  );
  const [newDraft, setNewDraft] = useState<DraftPlan | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  // Confirm-before-save (direct user request, 2026-08-28) — this form
  // controls real per-user pricing/quota behavior live for every current
  // and future subscriber the instant "Save" lands, with no undo. A typo
  // here (e.g. an accidental extra zero on a daily limit) previously took
  // effect immediately; this makes the change explicit before it commits.
  const [confirmingSave, setConfirmingSave] = useState<{ tier: string; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveExisting(tier: string): void {
    const draft = drafts[tier];
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await updatePlan(tier, draftToInput(draft));
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPlans((prev) => prev.map((p) => (p.tier === tier ? { ...p, ...draftToInput(draft), tier } : p)));
    });
  }

  function saveNew(): void {
    if (!newDraft) return;
    setError(null);
    startTransition(async () => {
      const result = await createPlan({ tier: newDraft.tier, ...draftToInput(newDraft) });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const created: PlanConfig = { tier: newDraft.tier, ...draftToInput(newDraft), seatsClaimed: 0 };
      setPlans((prev) => [...prev, created]);
      setDrafts((prev) => ({ ...prev, [newDraft.tier]: newDraft }));
      setNewDraft(null);
    });
  }

  function removePlan(tier: string): void {
    setError(null);
    startTransition(async () => {
      const result = await deletePlan(tier);
      if (!result.success) {
        setError(result.error);
        setConfirmingDelete(null);
        return;
      }
      setPlans((prev) => prev.filter((p) => p.tier !== tier));
      setConfirmingDelete(null);
    });
  }

  function handleConfirmedSave(): void {
    if (!confirmingSave) return;
    if (confirmingSave.isNew) saveNew();
    else saveExisting(confirmingSave.tier);
    setConfirmingSave(null);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-error">{error}</p>}

      {plans.map((plan) => (
        <PlanForm
          key={plan.tier}
          draft={drafts[plan.tier] ?? toDraft(plan)}
          isNew={false}
          onChange={(d) => setDrafts((prev) => ({ ...prev, [plan.tier]: d }))}
          onSave={() => setConfirmingSave({ tier: plan.tier, isNew: false })}
          onDelete={() => setConfirmingDelete(plan.tier)}
          pending={isPending}
        />
      ))}

      {newDraft ? (
        <PlanForm
          draft={newDraft}
          isNew
          onChange={setNewDraft}
          onSave={() => setConfirmingSave({ tier: newDraft.tier, isNew: true })}
          pending={isPending}
        />
      ) : (
        <button
          type="button"
          onClick={() => setNewDraft(EMPTY_DRAFT)}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
        >
          <Plus className="h-4 w-4" />
          Add a new plan
        </button>
      )}

      <ConfirmDialog
        open={confirmingDelete !== null}
        title="Delete this plan?"
        description="If any real user is still subscribed to this plan, the delete will be blocked — move them to a different plan first."
        confirmLabel="Delete"
        pending={isPending}
        onConfirm={() => confirmingDelete && removePlan(confirmingDelete)}
        onCancel={() => setConfirmingDelete(null)}
      />

      <ConfirmDialog
        open={confirmingSave !== null}
        title={confirmingSave?.isNew ? "Create this plan?" : "Save these changes?"}
        description="This takes effect immediately for every current and future subscriber on this plan — pricing, quotas, and marketing copy shown on /pricing all update live."
        confirmLabel={confirmingSave?.isNew ? "Create plan" : "Save changes"}
        pending={isPending}
        onConfirm={handleConfirmedSave}
        onCancel={() => setConfirmingSave(null)}
      />
    </div>
  );
}
