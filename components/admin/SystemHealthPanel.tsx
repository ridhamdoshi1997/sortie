"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, PauseCircle, PlayCircle, XCircle } from "lucide-react";

import { loadSystemHealth, setCrawlPaused } from "@/actions/adminSystem";
import type { HealthStatus, SystemHealth } from "@/lib/systemHealth";

// The operational console the admin portal never had (2026-09-10). Its one
// job is to tell an operator the truth quickly, so every panel states what it
// knows AND what it cannot see — an "unknown" is rendered as unknown, never
// softened into a zero or a green tick.

const STATUS_STYLES: Record<HealthStatus, { cls: string; label: string }> = {
  ok: { cls: "text-success", label: "OK" },
  warn: { cls: "text-warning", label: "Attention" },
  down: { cls: "text-error", label: "Down" },
  unknown: { cls: "text-text-muted", label: "Unknown" },
};

function StatusIcon({ status }: { status: HealthStatus }) {
  const cls = `h-4 w-4 shrink-0 ${STATUS_STYLES[status].cls}`;
  if (status === "ok") return <CheckCircle2 className={cls} />;
  if (status === "warn") return <AlertTriangle className={cls} />;
  if (status === "down") return <XCircle className={cls} />;
  return <HelpCircle className={cls} />;
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="font-mono text-xl font-bold tabular-nums text-text-primary">{value}</p>
      <p className="text-xs text-text-secondary">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-text-muted">{hint}</p>}
    </div>
  );
}

const num = (v: number | null) => (v === null ? "—" : v.toLocaleString());
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export function SystemHealthPanel({ initialData }: { initialData: SystemHealth }) {
  const [data, setData] = useState(initialData);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh(): void {
    startTransition(async () => {
      const r = await loadSystemHealth();
      if (r.success) setData(r.data);
    });
  }

  function togglePause(next: boolean): void {
    setError(null);
    startTransition(async () => {
      const r = await setCrawlPaused(next, next ? reason : null);
      if (!r.success) {
        setError(r.error ?? "Something went wrong.");
        return;
      }
      const fresh = await loadSystemHealth();
      if (fresh.success) setData(fresh.data);
      setReason("");
    });
  }

  const cacheOver = data.cache.totalPostings !== null && data.cache.totalPostings > data.cache.budget;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Live checks against the real services. Nothing here is cached.
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <Card
        title="Background crawls"
        action={
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${data.crawl.effectivePaused ? "text-warning" : "text-success"}`}>
            {data.crawl.effectivePaused ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {data.crawl.effectivePaused ? "Paused" : "Running"}
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-secondary p-3">
              <p className="text-xs font-medium text-text-primary">Emergency kill switch (env)</p>
              <p className="mt-1 text-sm text-text-secondary">
                {data.crawl.envPaused ? "CRAWL_PAUSED is SET — crawls are hard-stopped" : "Not set"}
              </p>
              <p className="mt-1 text-[11px] text-text-muted">
                Survives an unreachable database and always wins. Changing it needs an env edit and a redeploy — that
                is deliberate, so this page cannot flip it.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-secondary p-3">
              <p className="text-xs font-medium text-text-primary">Admin pause</p>
              <p className="mt-1 text-sm text-text-secondary">
                {data.crawl.dbPaused ? `Paused ${ago(data.crawl.pausedAt)}` : "Not paused"}
              </p>
              {data.crawl.reason && <p className="mt-1 text-[11px] text-text-muted">Reason: {data.crawl.reason}</p>}
            </div>
          </div>

          {!data.crawl.dbPaused ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you pausing? (optional, shown here later)"
                className="h-9 min-w-60 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
              />
              <button
                type="button"
                onClick={() => togglePause(true)}
                disabled={isPending}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-warning/40 px-3 text-sm font-medium text-warning transition-colors hover:bg-warning/10 disabled:opacity-60"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                Pause crawls
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => togglePause(false)}
              disabled={isPending}
              className="btn-signal inline-flex h-9 w-fit items-center gap-2 rounded-lg px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Resume crawls
            </button>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Job cache">
          <div className="grid grid-cols-2 gap-4">
            <Metric
              label="Postings cached"
              value={num(data.cache.totalPostings)}
              hint={`Budget ${data.cache.budget.toLocaleString()}`}
            />
            <Metric label="Still active" value={num(data.cache.activePostings)} />
          </div>
          {cacheOver && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Over the eviction budget — the hourly prune will trim it, dead postings first.
            </p>
          )}
          {data.cache.status === "unknown" && (
            <p className="mt-3 text-xs text-text-muted">Cache database unreachable — this is a gap, not a zero.</p>
          )}
        </Card>

        <Card title="News feed">
          <div className="grid grid-cols-2 gap-4">
            <Metric label="Stories" value={num(data.news.total)} hint={`${num(data.news.withImages)} with images`} />
            <Metric label="Last ingested" value={ago(data.news.lastIngestedAt)} hint="Runs daily" />
          </div>
          {data.news.byCategory.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.news.byCategory.map((c) => (
                <span key={c.category} className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-text-secondary">
                  {c.category.replace(/_/g, " ")} · {c.count}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="External services">
        <ul className="flex flex-col divide-y divide-border">
          {data.quotas.map((q) => (
            <li key={q.name} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <StatusIcon status={q.status} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                  {q.name}
                  <span className={`text-[11px] font-normal ${STATUS_STYLES[q.status].cls}`}>
                    {STATUS_STYLES[q.status].label}
                  </span>
                </p>
                <p className="mt-0.5 text-xs leading-5 text-text-secondary">{q.detail}</p>
                {q.renewsOn && <p className="mt-0.5 text-[11px] text-text-muted">Renews {q.renewsOn}</p>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Moderation queue">
        <Metric
          label="Candidate-contributed interview questions"
          value={num(data.contributions.pending)}
          hint="Published immediately — there is no approval step yet."
        />
      </Card>
    </div>
  );
}
