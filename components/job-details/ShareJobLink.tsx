"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Check, Link2, X } from "lucide-react";

import { createShareLink, revokeShareLink } from "@/actions/jobs";
import { useToast } from "@/components/ui/ToastProvider";

// Module scope, not inline: useSyncExternalStore resubscribes whenever the
// subscribe function's identity changes, so an inline arrow would tear down
// and re-establish the subscription on every render. window.location.origin
// cannot change for the life of the page, so there is genuinely nothing to
// subscribe to and the returned unsubscribe is a no-op.
const subscribeToStableValue = () => () => {};
const getOrigin = (): string | null => window.location.origin;
const getOriginOnServer = (): string | null => null;

// Shareable public evaluation link (build-plan.md §I) — self-contained,
// same pattern as AddToCompareButton.tsx. Only the user's own AI evaluation
// output is ever exposed publicly (see public.job_shares view) — never the
// scraped posting text, salary, personal notes, or application status.
export function ShareJobLink({ jobId, initialShareToken }: { jobId: string; initialShareToken: string | null }) {
  const { showToast } = useToast();
  const [token, setToken] = useState(initialShareToken);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  // window.location.origin is only readable client-side — same
  // SSR/hydration-mismatch class as JobActionBar's foundAtLabel effect.
  // Computing it inline during render diverges between the server pass
  // (window undefined) and client hydration, which React flags as a real
  // hydration error, not just a lint nit.
  //
  // useSyncExternalStore rather than the setState-in-an-effect this used to
  // be: that pattern is exactly what react-hooks/set-state-in-effect flags,
  // and the usual fix in this codebase (defer the setState in a
  // setTimeout(..., 0) — see RESUME.md's gotchas) would add a timer and a
  // second render to read a value that never changes. This is the hook
  // React provides for precisely this shape: the server snapshot renders
  // null so SSR and hydration agree, then the client snapshot supplies the
  // real origin.
  const origin = useSyncExternalStore(subscribeToStableValue, getOrigin, getOriginOnServer);

  const shareUrl = token && origin ? `${origin}/share/${token}` : null;

  function handleCreate(): void {
    startTransition(async () => {
      const result = await createShareLink(jobId);
      if (result.success && result.token) {
        setToken(result.token);
      } else {
        showToast(result.error ?? "Failed to create share link", "error");
      }
    });
  }

  function handleCopy(): void {
    if (!shareUrl) return;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        showToast("Share link copied", "success");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => showToast("Couldn't copy — copy the link manually", "error"));
  }

  function handleRevoke(): void {
    const previous = token;
    setToken(null);
    startTransition(async () => {
      const result = await revokeShareLink(jobId);
      if (!result.success) {
        setToken(previous);
        showToast(result.error ?? "Failed to revoke share link", "error");
      } else {
        showToast("Share link revoked", "success");
      }
    });
  }

  if (!token) {
    return (
      <button
        type="button"
        onClick={handleCreate}
        disabled={isPending}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50"
      >
        <Link2 className="h-4 w-4" />
        Get shareable link
      </button>
    );
  }

  return (
    <div className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent bg-accent-muted pl-3 pr-1 py-1 text-sm">
      <span className="max-w-[220px] truncate font-mono text-xs text-accent">{shareUrl}</span>
      <button
        type="button"
        onClick={handleCopy}
        title="Copy link"
        className="rounded-md p-1.5 text-accent transition-colors hover:bg-accent-light"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={handleRevoke}
        disabled={isPending}
        title="Revoke link"
        className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-error disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
