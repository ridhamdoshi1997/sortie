"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";

import { LimitReachedModal, type LimitReachedReason } from "@/components/shared/LimitReachedModal";

type Props = {
  firstName: string;
  lastName: string;
  companyLinkedinUrl: string;
};

// Displays a found email for the candidate to copy and use themselves —
// this app never sends anything on the candidate's behalf. Not persisted;
// the result lives only in this component's state.
export function EmailLookupButton({ firstName, lastName, companyLinkedinUrl }: Props) {
  const [email, setEmail] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitModal, setLimitModal] = useState<{ reason: LimitReachedReason; message: string; resetsAt?: string; canUpgrade?: boolean } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    if (email || notFound) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/documents/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName, lastName, companyLinkedinUrl }),
        });
        const json = (await res.json()) as {
          success: boolean;
          data?: { email: string | null };
          error?: string;
          reason?: LimitReachedReason;
          resetsAt?: string;
          canUpgrade?: boolean;
        };

        if (!res.ok || !json.success) {
          if (json.reason) {
            setLimitModal({ reason: json.reason, message: json.error ?? "Monthly limit reached.", resetsAt: json.resetsAt, canUpgrade: json.canUpgrade });
          } else {
            setError(json.error ?? "Could not find an email for this profile.");
          }
          return;
        }

        if (json.data?.email) {
          setEmail(json.data.email);
        } else {
          setNotFound(true);
        }
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  if (email) {
    return (
      <a
        href={`mailto:${email}`}
        title="Best-effort match, not guaranteed deliverable"
        className="inline-flex items-center gap-1 rounded-full bg-success-lightest px-2 py-1 text-xs font-medium text-success-foreground"
      >
        <Mail className="h-3 w-3" />
        {email}
      </a>
    );
  }

  if (notFound) {
    return <span className="text-xs text-text-muted">No email found</span>;
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        title="Find work email"
        aria-label="Find work email"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
      >
        <Mail className="h-3.5 w-3.5" />
      </button>
      {error && (
        <p className="absolute right-0 top-8 z-10 w-40 text-right text-xs text-error">
          {error}
        </p>
      )}
      {limitModal && (
        <LimitReachedModal
          reason={limitModal.reason}
          featureLabel="email lookups"
          message={limitModal.message}
          resetsAt={limitModal.resetsAt}
          canUpgrade={limitModal.canUpgrade}
          onClose={() => setLimitModal(null)}
        />
      )}
    </div>
  );
}
