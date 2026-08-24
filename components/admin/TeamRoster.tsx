"use client";

import { useState, useTransition } from "react";

import { addAdmin, getAdminRoster, removeAdmin } from "@/actions/admin";
import type { AdminRole } from "@/lib/admin/auth";
import type { AdminRosterRow } from "@/lib/admin/queries";

const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner",
  admin: "Admin",
  support_readonly: "Support (read-only)",
};

const ROLE_CHIP_CLASS: Record<AdminRole, string> = {
  owner: "bg-accent-light text-accent",
  admin: "bg-info-light text-info",
  support_readonly: "bg-surface-secondary text-text-secondary",
};

const ROLE_DESCRIPTIONS: { role: AdminRole; description: string }[] = [
  {
    role: "owner",
    description: "Everything, including adding/removing other admins and the AI kill switch.",
  },
  {
    role: "admin",
    description:
      "Suspend/unsuspend users, adjust usage caps, manage content, read the audit log. Cannot add other admins or touch the kill switch.",
  },
  {
    role: "support_readonly",
    description: "Full read access everywhere. Zero write actions — for a support person who needs context, not levers.",
  },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Team & Roles (2026-08-19, direct user request) — hardcoded 3-tier
// permissions, not a permission-matrix builder (see lib/admin/auth.ts's
// requireRole() comment for why that's the right size for a 2-5 person
// team). Only "owner" sees the invite form / Revoke buttons — everyone
// else gets a read-only roster, matching their own actual permissions.
export function TeamRoster({ initialAdmins, viewerRole }: { initialAdmins: AdminRosterRow[]; viewerRole: AdminRole }) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("support_readonly");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOwner = viewerRole === "owner";
  const ownerCount = admins.filter((a) => a.role === "owner").length;

  function refresh(): void {
    startTransition(async () => {
      const result = await getAdminRoster();
      if (result.success) setAdmins(result.admins);
    });
  }

  function handleInvite(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addAdmin(email, role);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEmail("");
      setRole("support_readonly");
      refresh();
    });
  }

  function handleRevoke(adminId: string): void {
    setError(null);
    startTransition(async () => {
      const result = await removeAdmin(adminId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {isOwner && (
        <form onSubmit={handleInvite} className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@email.com"
            required
            className="h-10 min-w-[240px] flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          >
            <option value="support_readonly">Support (read-only)</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
          <button
            type="submit"
            disabled={isPending}
            className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Send invite
          </button>
        </form>
      )}
      {error && <p className="text-xs text-error">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-surface-secondary">
              {["Person", "Role", "Added", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-t border-border">
                <td className="px-5 py-4 text-text-primary">{a.email ?? "—"}</td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_CHIP_CLASS[a.role]}`}>
                    {ROLE_LABELS[a.role]}
                  </span>
                </td>
                <td className="px-5 py-4 font-mono text-text-secondary">{formatDate(a.createdAt)}</td>
                <td className="px-5 py-4">
                  {isOwner &&
                    (a.role === "owner" && ownerCount <= 1 ? (
                      <span className="text-xs text-text-muted">Can&apos;t remove last owner</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRevoke(a.id)}
                        disabled={isPending}
                        className="text-xs font-medium text-error hover:underline disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted">What each role can do</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {ROLE_DESCRIPTIONS.map(({ role: r, description }) => (
            <div key={r} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
              <span className={`mb-2 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_CHIP_CLASS[r]}`}>
                {ROLE_LABELS[r]}
              </span>
              <p className="text-xs leading-5 text-text-secondary">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
