import { AlertTriangle, ArrowDown, CheckCircle2, Power, Zap } from "lucide-react";

import type { AppSettings } from "@/lib/admin/queries";
import type { ModelHealth } from "@/lib/admin/modelHealth";

// The half of /admin/ai-models that was missing (Phase 52, section 3). The
// page could edit which model resolves where, but could not answer either
// question that comes up when something is wrong: what is actually serving
// traffic, and is anything rate-limited right now.
//
// A server component on purpose — every value is read-only and computed
// server-side, so there is no state to hydrate. The editor below it
// (AiModelsManager) stays the only client component on the page.

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ModelHealthPanel({ health, settings }: { health: ModelHealth; settings: AppSettings }) {
  const fallbackPct =
    health.totalCalls > 0 ? Math.round((health.totalFallbackCalls / health.totalCalls) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* The kill switch reads the same way as System Health's crawl pause,
          deliberately — two emergency levers presented in two different
          visual languages is how an operator reaches for the wrong one. */}
      <Card title="Site-wide AI kill switch">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              settings.aiEnabled ? "text-success" : "text-error"
            }`}
          >
            <Power className="h-4 w-4" />
            {settings.aiEnabled ? "AI enabled" : "AI disabled site-wide"}
          </span>
          <span className="text-xs text-text-muted">
            last changed {formatWhen(settings.updatedAt)}
            {settings.updatedByEmail ? ` by ${settings.updatedByEmail}` : ""}
          </span>
        </div>
        {!settings.aiEnabled && (
          <p className="mt-2 text-xs text-error">
            Reason shown to users: {settings.aiDisabledReason || "(none set)"}
          </p>
        )}
        <p className="mt-2 text-xs text-text-muted">
          Checked before every metered action, with no exceptions — admin accounts included. It exists for a runaway-bug
          or bot-spam scenario where the point is stopping every AI call app-wide.
        </p>
      </Card>

      <Card title={`Gemini fast-tier fallback chain — last ${health.windowDays} days`}>
        <p className="text-xs text-text-muted">
          The exact order <code className="font-mono">complete()</code> walks on a 429/503. The free tier has both an RPM
          and a hard daily RPD cap, and when the primary trips, everything silently runs on a fallback — this is the only
          place that is visible.
        </p>
        <ol className="mt-3 flex flex-col gap-2">
          {health.geminiChain.map((link, i) => (
            <li key={link.modelId} className="flex items-start gap-2">
              {i > 0 ? (
                <ArrowDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
              ) : (
                <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-text-primary">{link.modelId}</span>
                  <span className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                    {link.role}
                  </span>
                  {link.likelyCoolingDown && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      likely cooling down
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-text-muted">
                  {link.calls} call{link.calls === 1 ? "" : "s"} · {link.rateLimited} rate-limited · last limited{" "}
                  {formatWhen(link.lastRateLimitedAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-text-muted">
          &ldquo;Likely cooling down&rdquo; means a rate-limit landed inside the last 60 seconds — the same window
          <code className="mx-1 font-mono">markCooldown()</code>
          uses. It is an inference, not that Map: the Map is per-lambda and request-local, so no page render can read the
          fleet&apos;s real cooldown state.
        </p>
      </Card>

      <Card title={`Model usage — last ${health.windowDays} days`}>
        {health.noDataYet ? (
          <p className="text-sm text-text-muted">
            No model usage recorded yet. This table fills from real AI calls made after the instrumentation shipped
            (2026-09-11) — it is not backfilled, because nothing in the database ever recorded which model served a call
            before that.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-secondary">
              <span>
                <span className="font-mono text-text-primary">{health.totalCalls}</span> calls
              </span>
              <span>
                <span className="font-mono text-text-primary">{health.totalFallbackCalls}</span> served by a fallback (
                {fallbackPct}%)
              </span>
              <span>
                <span className="font-mono text-text-primary">{health.totalRateLimited}</span> rate-limited
              </span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="bg-surface-secondary">
                    {["Model", "Provider", "Calls", "Via fallback", "Rate-limited", "Last limited"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {health.usage.map((r) => (
                    <tr key={`${r.provider}:${r.modelId}`} className="border-t border-border">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-text-primary">{r.modelId}</span>
                        {r.isConfigured && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
                            <CheckCircle2 className="h-3 w-3" />
                            configured
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{r.provider}</td>
                      <td className="px-4 py-2.5 font-mono text-text-primary">{r.calls}</td>
                      <td className="px-4 py-2.5 font-mono text-text-secondary">{r.fallbackCalls}</td>
                      <td className={`px-4 py-2.5 font-mono ${r.rateLimited > 0 ? "text-warning" : "text-text-secondary"}`}>
                        {r.rateLimited}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{formatWhen(r.lastRateLimitedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {/* Deliberately no per-model dollar column. ai_cost_rates is keyed by
            UsageAction, not by model, so a per-model cost would have to be
            invented — and every Gemini model here is free-tier anyway, where
            the real constraint is quota, not spend. The actual dollars live
            on /admin/expenses, which measures them. */}
        <p className="mt-3 text-xs text-text-muted">
          No cost column here on purpose: rates are priced per action, not per model, and every Gemini model above is
          free-tier, where the constraint is quota rather than dollars. Real spend is measured on{" "}
          <a href="/admin/expenses" className="text-accent hover:underline">
            Expenses
          </a>
          .
        </p>
      </Card>
    </div>
  );
}
