"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Handshake, Loader2 } from "lucide-react";

import { applyToBecomeAffiliate, getMyAffiliateStatus, type AffiliateStatus } from "@/actions/affiliates";

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Affiliate program — real cash commission for referring paying
// subscribers, distinct from the Referrals tab's instant, no-approval
// peer-referral link (in-app usage-multiplier reward, not money). This
// one requires an admin to approve the application before the link does
// anything (the Stripe fulfillment trigger only records a commission for
// status='approved' affiliates), so this shows a real pending/approved/
// rejected state rather than an instantly-active link.
export function AffiliateTab() {
  const [status, setStatus] = useState<AffiliateStatus | null>(null);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isApplying, startApplying] = useTransition();

  useEffect(() => {
    getMyAffiliateStatus().then(setStatus);
  }, []);

  function handleApply(): void {
    setError(null);
    startApplying(async () => {
      const result = await applyToBecomeAffiliate(paypalEmail);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const refreshed = await getMyAffiliateStatus();
      setStatus(refreshed);
    });
  }

  function handleCopyLink(): void {
    if (!status?.affiliateCode) return;
    navigator.clipboard.writeText(`${window.location.origin}/?aff=${status.affiliateCode}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-text-primary">Affiliate program</h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Earn a real cash commission for every paying subscriber you refer, paid out via PayPal once approved.
        </p>
      </div>

      {!status.applied && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <label className="text-xs font-medium text-text-secondary" htmlFor="paypal-email">
            Your PayPal email (where payouts will be sent)
          </label>
          <input
            id="paypal-email"
            type="email"
            value={paypalEmail}
            onChange={(e) => setPaypalEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <button
            type="button"
            disabled={isApplying || !paypalEmail}
            onClick={handleApply}
            className="btn-signal inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            <Handshake className="h-4 w-4" />
            {isApplying ? "Submitting…" : "Apply to become an affiliate"}
          </button>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      )}

      {status.applied && status.status === "pending" && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning">
          Your application is pending review. We&apos;ll notify you once it&apos;s approved.
        </div>
      )}

      {status.applied && status.status === "rejected" && (
        <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-sm text-text-secondary">
          Your application wasn&apos;t approved. Contact support if you have questions.
        </div>
      )}

      {status.applied && status.status === "approved" && status.affiliateCode && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
            <code className="min-w-0 flex-1 truncate text-xs text-text-primary">
              {`${typeof window !== "undefined" ? window.location.origin : ""}/?aff=${status.affiliateCode}`}
            </code>
            <button
              type="button"
              onClick={handleCopyLink}
              className="btn-signal inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-accent-foreground"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Commission rate</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{Math.round((status.commissionRate ?? 0) * 100)}%</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-secondary px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Referrals converted</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{status.totalConversions}</p>
            </div>
            <div className="rounded-lg border border-agent/30 bg-agent-light/50 px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-agent-dark">Unpaid balance</p>
              <p className="mt-1 text-lg font-semibold text-agent-dark">{formatCents(status.unpaidCents)}</p>
            </div>
          </div>
          {status.paidCents > 0 && (
            <p className="text-xs text-text-muted">{formatCents(status.paidCents)} paid out so far.</p>
          )}
        </>
      )}
    </div>
  );
}
