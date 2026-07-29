"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CreditCard, LogOut, Shield, Ticket, Trash2 } from "lucide-react";

import { deleteAccount } from "@/actions/account";
import { PostHogLogoutLink } from "@/components/analytics/PostHogLogoutLink";

type Props = {
  email: string;
  providers: string[];
};

type TabKey = "security" | "subscription" | "credits" | "alerts";

const NAV: Array<{ key: TabKey; icon: typeof Shield; label: string }> = [
  { key: "security", icon: Shield, label: "Login & security" },
  { key: "subscription", icon: CreditCard, label: "Subscription" },
  { key: "credits", icon: Ticket, label: "Credits & usage" },
  { key: "alerts", icon: Bell, label: "Job alerts" },
];

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  email: "Email & password",
};

// Deliberately not built yet — no monetization or notification-producing
// backend exists (see context/build-action-plan-2026-07-28.md's Phase 1/4).
// Shown as an honest "not available yet" state within just this panel,
// rather than faking data or hiding the nav item entirely.
function NotYetAvailable({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <p className="text-sm font-medium text-text-primary">{label} isn&apos;t available yet</p>
      <p className="max-w-xs text-xs leading-5 text-text-muted">
        This is on the roadmap — nothing to configure here yet.
      </p>
    </div>
  );
}

function DeleteAccountSection() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    const result = await deleteAccount();
    if (!result.success) {
      setError(result.error ?? "Something went wrong. Please try again.");
      setIsDeleting(false);
      return;
    }
    router.push("/login");
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-error/30 bg-error/5 p-4">
      <div>
        <p className="text-sm font-medium text-error">Delete account</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Permanently erases your profile, jobs, evaluations, and generated documents. This
          cannot be undone.
        </p>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg bg-error px-4 text-sm font-medium text-error-foreground transition-opacity hover:opacity-90"
        >
          <Trash2 className="h-4 w-4" />
          Delete my account
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-error/30 bg-surface p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-text-secondary">
              Type <span className="font-mono font-semibold text-error">DELETE</span> to confirm.
            </span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={isDeleting}
              className="h-9 rounded-lg border border-border bg-transparent px-3 text-sm text-text-primary outline-none focus-visible:border-error"
              placeholder="DELETE"
            />
          </label>
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={confirmText !== "DELETE" || isDeleting}
              onClick={handleDelete}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-error px-4 text-sm font-medium text-error-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setConfirming(false);
                setConfirmText("");
                setError(null);
              }}
              className="inline-flex min-h-9 items-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PasswordResetRow({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function handleClick() {
    setStatus("sending");
    await fetch("/api/auth/request-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setStatus("sent");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
      <div>
        <p className="text-sm font-medium text-text-primary">Password</p>
        <p className="text-xs text-text-muted">
          {status === "sent" ? "Check your email for a reset code." : "Send yourself a reset code"}
        </p>
      </div>
      <button
        onClick={handleClick}
        disabled={status !== "idle"}
        className="inline-flex min-h-9 items-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : status === "sent" ? "Sent" : "Reset password"}
      </button>
    </div>
  );
}

function LoginSecurityTab({ email, providers }: Props) {
  const hasPassword = providers.includes("email");
  const oauthProviders = providers.filter((p) => p !== "email");

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-base font-semibold text-text-primary">Login &amp; security</h3>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          Email
        </span>
        <span className="text-sm text-text-secondary">{email}</span>
      </div>

      {oauthProviders.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Signed in with
          </span>
          {oauthProviders.map((p) => (
            <span
              key={p}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary"
            >
              {PROVIDER_LABEL[p] ?? p}
            </span>
          ))}
        </div>
      )}

      {hasPassword && <PasswordResetRow email={email} />}

      <div className="border-t border-border pt-5">
        <DeleteAccountSection />
      </div>
    </div>
  );
}

export function SettingsPanel({ email, providers }: Props) {
  const [tab, setTab] = useState<TabKey>("security");

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-card sm:grid-cols-[minmax(0,0.4fr)_minmax(0,1fr)]">
      <div className="flex flex-col justify-between border-b border-border bg-surface-secondary p-4 sm:border-b-0 sm:border-r">
        <div className="flex flex-col gap-1">
          {NAV.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                tab === key
                  ? "bg-accent-muted font-medium text-accent"
                  : "text-text-secondary hover:bg-surface"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
        <PostHogLogoutLink className="mt-6 flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-muted transition-colors hover:text-text-primary">
          <LogOut className="h-4 w-4" />
          Sign out
        </PostHogLogoutLink>
      </div>

      <div className="p-6">
        {tab === "security" && <LoginSecurityTab email={email} providers={providers} />}
        {tab === "subscription" && <NotYetAvailable label="Subscription" />}
        {tab === "credits" && <NotYetAvailable label="Credits & usage" />}
        {tab === "alerts" && <NotYetAvailable label="Job alerts" />}
      </div>
    </div>
  );
}
