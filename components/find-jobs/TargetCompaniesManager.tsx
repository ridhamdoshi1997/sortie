"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { addTargetCompany, deleteTargetCompany, scanTargetCompanies, type TargetCompanyRow } from "@/lib/actions/scraper.actions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const ATS_OPTIONS: { value: TargetCompanyRow["ats_platform"]; label: string; hint: string }[] = [
  { value: "greenhouse", label: "Greenhouse", hint: "e.g. stripe — from boards.greenhouse.io/stripe" },
  { value: "lever", label: "Lever", hint: "e.g. netflix — from jobs.lever.co/netflix" },
  { value: "ashby", label: "Ashby", hint: "e.g. ramp — from jobs.ashbyhq.com/ramp" },
];

// Phase 8 "Portal Scanner" (build-plan.md §24) — a user-curated watchlist of
// companies scanned directly via their own ATS's public job-board API, so
// every job that comes back has a guaranteed-real apply link (no trust
// classifier needed — see lib/atsProviders.ts). Deliberately minimal v1: no
// existing CRUD-list pattern in this app to mirror closely, so this reuses
// existing primitives (.btn-signal, ConfirmDialog) rather than inventing new
// ones for a first pass.
export function TargetCompaniesManager({ userId, companies }: { userId: string; companies: TargetCompanyRow[] }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [atsPlatform, setAtsPlatform] = useState<TargetCompanyRow["ats_platform"]>("greenhouse");
  const [companySlug, setCompanySlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAdding, startAdd] = useTransition();
  const [isScanning, startScan] = useTransition();
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  function handleAdd(): void {
    if (!companyName.trim() || !companySlug.trim()) {
      setError("Company name and board slug are both required.");
      return;
    }
    setError(null);
    startAdd(async () => {
      try {
        await addTargetCompany(userId, companyName.trim(), atsPlatform, companySlug.trim());
        setCompanyName("");
        setCompanySlug("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add company.");
      }
    });
  }

  function handleScan(): void {
    setScanMessage(null);
    startScan(async () => {
      try {
        const saved = await scanTargetCompanies(userId);
        setScanMessage(saved.length > 0 ? `Found ${saved.length} job${saved.length === 1 ? "" : "s"}.` : "No new or updated jobs found.");
        router.refresh();
      } catch (err) {
        setScanMessage(err instanceof Error ? err.message : "Scan failed.");
      }
    });
  }

  function confirmDelete(): void {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    startDelete(async () => {
      try {
        await deleteTargetCompany(userId, id);
        router.refresh();
      } finally {
        setPendingDeleteId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Company Watchlist</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Scan specific companies&apos; own career boards directly — every job here comes with a real, direct
            apply link, no third-party mirror ever involved.
          </p>
        </div>
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning || companies.length === 0}
          className="btn-signal inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Scan now
        </button>
      </div>

      {scanMessage && <p className="text-sm text-text-secondary">{scanMessage}</p>}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Company name</label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Stripe"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </div>
        <div className="sm:w-40">
          <label className="mb-1 block text-xs font-medium text-text-secondary">ATS platform</label>
          <select
            value={atsPlatform}
            onChange={(e) => setAtsPlatform(e.target.value as TargetCompanyRow["ats_platform"])}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          >
            {ATS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Board slug</label>
          <input
            value={companySlug}
            onChange={(e) => setCompanySlug(e.target.value)}
            placeholder={ATS_OPTIONS.find((o) => o.value === atsPlatform)?.hint}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isAdding}
          className="btn-signal inline-flex min-h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}

      {companies.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
          <Building2 className="h-6 w-6 text-text-muted" />
          <p className="text-sm text-text-secondary">No companies tracked yet — add one above to start scanning.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {companies.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-text-primary">{c.company_name}</p>
                <p className="text-xs text-text-muted">
                  {ATS_OPTIONS.find((o) => o.value === c.ats_platform)?.label} · {c.company_slug}
                  {c.last_scanned_at ? ` · last scanned ${new Date(c.last_scanned_at).toLocaleDateString()}` : " · never scanned"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteId(c.id)}
                aria-label={`Remove ${c.company_name}`}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-secondary hover:text-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Remove from watchlist?"
        description="This company will stop being scanned. Jobs already saved from it stay in your search results."
        tone="danger"
        pending={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
