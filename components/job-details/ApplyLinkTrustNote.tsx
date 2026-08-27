"use client";

import { useState, useTransition } from "react";
import { Flag, ShieldAlert } from "lucide-react";

import { classifyApplyHost } from "@/lib/applyLinkTrust";
import { createSupportTicket } from "@/actions/support";
import { useToast } from "@/components/ui/ToastProvider";

// Real user report (2026-08-27): apply links sometimes resolve to
// third-party mirrors, and occasionally a genuine scam/SEO-farm site.
// lib/applyLinkTrust.ts + lib/reresolveApplyLink.ts fix most of these
// automatically, but a real residual gap remains — live-tested proof: for
// some small/agency-posted listings, EVERY indexed source on the whole web
// is a mirror, so there's genuinely nothing better to resolve to. Matches
// JobRight's own pattern (confirmed live in this session) of surfacing a
// "third-party source" note plus a report action rather than silently
// presenting an unverified link with full confidence.
export function ApplyLinkTrustNote({
  applyUrl,
  company,
  jobId,
  jobTitle,
}: {
  applyUrl: string;
  company: string | null;
  jobId: string;
  jobTitle: string | null;
}) {
  const { showToast } = useToast();
  const [isReporting, startReport] = useTransition();
  const [reported, setReported] = useState(false);

  const trust = classifyApplyHost(applyUrl, company);
  // ats/employer are the employer's own real posting — no note needed.
  // aggregator (LinkedIn/Indeed/etc) is a safe, moderated landing page —
  // also no note. Only unverified/low_quality get flagged.
  if (trust === "ats" || trust === "employer" || trust === "aggregator") return null;

  function handleReport(): void {
    startReport(async () => {
      const result = await createSupportTicket(
        `Bad apply link — ${jobTitle ?? "job"} at ${company ?? "unknown company"}`,
        `Reported from a job's detail page. Job ID: ${jobId}. Apply link: ${applyUrl}`,
        { category: "bug" }
      );
      if (result.success) {
        setReported(true);
        showToast("Reported — thanks, we'll take a look.", "success");
      } else {
        showToast(result.error, "error");
      }
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-surface px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
        <ShieldAlert className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm leading-5 text-text-secondary">
          Third-party listing — verify before applying, not confirmed as the employer&apos;s own page.
        </p>
        <button
          type="button"
          onClick={handleReport}
          disabled={isReporting || reported}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-warning underline decoration-dotted underline-offset-2 hover:opacity-80 disabled:no-underline disabled:opacity-60"
        >
          <Flag className="h-3 w-3" />
          {reported ? "Reported" : isReporting ? "Reporting…" : "Report a bad link"}
        </button>
      </div>
    </div>
  );
}
