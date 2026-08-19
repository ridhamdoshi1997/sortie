"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldOff, Users } from "lucide-react";

import { setUserSuspended, type AdminDashboardData } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TrendChart } from "@/components/admin/TrendChart";
import { AiKillSwitch } from "@/components/admin/AiKillSwitch";

// v1 slice, per agy's build-order review: the actual first real use case
// ("see who's burning the shared AI rate limit, suspend them") on one
// page — no route-module split, no per-user detail view, no admin_notes
// yet. Those are additive later per build-plan.md §R's "each module is
// additive, not a rewrite" structure, not missing pieces of this slice.
export function AdminDashboard({ initialData }: { initialData: AdminDashboardData }) {
  const [data, setData] = useState(initialData);
  const [confirmTarget, setConfirmTarget] = useState<{ userId: string; email: string | null } | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const totalRunsToday = data.topUsers.reduce((sum, u) => sum + u.totalRuns, 0);
  const signupsInWindow = data.signups.reduce((sum, d) => sum + d.count, 0);

  function applySuspension(userId: string, suspend: boolean): void {
    setError(null);
    setPendingUserId(userId);
    startTransition(async () => {
      const result = await setUserSuspended(userId, suspend);
      setPendingUserId(null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setData((prev) => ({
        ...prev,
        topUsers: prev.topUsers.map((u) => (u.userId === userId ? { ...u, isSuspended: suspend } : u)),
      }));
      setConfirmTarget(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <AiKillSwitch initialSettings={data.appSettings} />

      <div className="flex justify-end">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          View all users
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Total users" value={data.totalUsers} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Signups (14d)" value={signupsInWindow} />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="AI runs today" value={totalRunsToday} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendChart title="Signups (14 days)" data={data.signups} colorVar="var(--color-accent)" />
        <TrendChart title="AI usage (14 days)" data={data.usage} colorVar="var(--color-info)" />
      </div>

      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <h2 className="text-base font-semibold leading-6 text-text-primary">Top users by AI usage — today</h2>
        {error && <p className="mt-2 text-xs text-error">{error}</p>}
        {data.topUsers.length === 0 ? (
          <p className="mt-6 text-sm text-text-muted">No AI usage logged yet today.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-surface-secondary">
                  {["User", "Runs today", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.topUsers.map((u) => (
                  <tr key={u.userId} className="border-t border-border">
                    <td className="px-5 py-4">
                      <Link href={`/admin/users/${u.userId}`} className="text-accent hover:underline">
                        {u.email ?? u.userId}
                      </Link>
                    </td>
                    <td className="px-5 py-4 font-mono text-text-primary">{u.totalRuns}</td>
                    <td className="px-5 py-4">
                      {u.isSuspended ? (
                        <span className="rounded-full bg-error/10 px-2.5 py-1 text-xs font-medium text-error">Suspended</span>
                      ) : u.isSuspicious ? (
                        <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                          High usage
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">Active</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {u.isSuspended ? (
                        <button
                          type="button"
                          onClick={() => applySuspension(u.userId, false)}
                          disabled={pendingUserId === u.userId}
                          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
                        >
                          Unsuspend
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmTarget({ userId: u.userId, email: u.email })}
                          disabled={pendingUserId === u.userId}
                          className="inline-flex items-center gap-1.5 rounded-md border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-60"
                        >
                          <ShieldOff className="h-3 w-3" />
                          Suspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Suspend this user?"
        description={`${confirmTarget?.email ?? "This user"} will be blocked from every AI-costing action immediately. You can unsuspend them any time.`}
        confirmLabel="Suspend"
        pending={pendingUserId === confirmTarget?.userId}
        onConfirm={() => confirmTarget && applySuspension(confirmTarget.userId, true)}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center gap-2 text-text-secondary">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-3 font-mono text-3xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
