"use client";

import { useState, useTransition } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import { createPlan, deletePlan, updatePlan, type PlanInput } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PlanConfig } from "@/lib/subscription";

type DraftPlan = {
  tier: string;
  displayName: string;
  priceCents: number;
  billingPeriod: "month" | "year";
  insiderConnectionsMonthlyLimit: number;
  companyResearchMonthlyLimit: number;
  jobEvaluationsDailyLimitInput: string; // "" means unlimited (null)
  llmUnlocked: boolean;
  featureBulletsText: string; // one bullet per line
  stripePriceId: string;
};

function toDraft(plan: PlanConfig): DraftPlan {
  return {
    tier: plan.tier,
    displayName: plan.displayName,
    priceCents: plan.priceCents,
    billingPeriod: plan.billingPeriod,
    insiderConnectionsMonthlyLimit: plan.insiderConnectionsMonthlyLimit,
    companyResearchMonthlyLimit: plan.companyResearchMonthlyLimit,
    jobEvaluationsDailyLimitInput: plan.jobEvaluationsDailyLimit === null ? "" : String(plan.jobEvaluationsDailyLimit),
    llmUnlocked: plan.llmUnlocked,
    featureBulletsText: plan.featureBullets.join("\n"),
    stripePriceId: plan.stripePriceId ?? "",
  };
}

function draftToInput(draft: DraftPlan): Omit<PlanInput, "tier"> {
  return {
    displayName: draft.displayName,
    priceCents: draft.priceCents,
    billingPeriod: draft.billingPeriod,
    insiderConnectionsMonthlyLimit: draft.insiderConnectionsMonthlyLimit,
    companyResearchMonthlyLimit: draft.companyResearchMonthlyLimit,
    jobEvaluationsDailyLimit: draft.jobEvaluationsDailyLimitInput.trim() === "" ? null : Number(draft.jobEvaluationsDailyLimitInput),
    llmUnlocked: draft.llmUnlocked,
    featureBullets: draft.featureBulletsText.split("\n").map((b) => b.trim()).filter(Boolean),
    stripePriceId: draft.stripePriceId.trim() || null,
  };
}

const EMPTY_DRAFT: DraftPlan = {
  tier: "",
  displayName: "",
  priceCents: 0,
  billingPeriod: "month",
  insiderConnectionsMonthlyLimit: 0,
  companyResearchMonthlyLimit: 0,
  jobEvaluationsDailyLimitInput: "3",
  llmUnlocked: false,
  featureBulletsText: "",
  stripePriceId: "",
};

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
            onChange={(e) => onChange({ ...draft, billingPeriod: e.target.value as "month" | "year" })}
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          >
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
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
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
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
      const created: PlanConfig = { tier: newDraft.tier, ...draftToInput(newDraft) };
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

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-error">{error}</p>}

      {plans.map((plan) => (
        <PlanForm
          key={plan.tier}
          draft={drafts[plan.tier] ?? toDraft(plan)}
          isNew={false}
          onChange={(d) => setDrafts((prev) => ({ ...prev, [plan.tier]: d }))}
          onSave={() => saveExisting(plan.tier)}
          onDelete={() => setConfirmingDelete(plan.tier)}
          pending={isPending}
        />
      ))}

      {newDraft ? (
        <PlanForm
          draft={newDraft}
          isNew
          onChange={setNewDraft}
          onSave={saveNew}
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
    </div>
  );
}
