import type { ReferralOverview } from "@/lib/admin/referrals";

export function ReferralsOverview({ overview }: { overview: ReferralOverview }) {
  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Referrals</h2>
        <span className="rounded-full bg-agent-light px-2.5 py-1 text-xs font-medium text-agent-dark">
          {overview.totalReferrals} successful referral{overview.totalReferrals === 1 ? "" : "s"}
        </span>
      </div>

      {overview.topReferrers.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">No successful referrals yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="bg-surface-secondary">
                {["User", "Referrals"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.topReferrers.map((r) => (
                <tr key={r.userId} className="border-t border-border">
                  <td className="px-5 py-4 text-text-primary">{r.email ?? r.userId}</td>
                  <td className="px-5 py-4 font-mono text-text-secondary">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
