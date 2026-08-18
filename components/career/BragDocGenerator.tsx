"use client";

import { useState, useTransition } from "react";
import { Download, FileText, Sparkles } from "lucide-react";

import { generateBragDocAction } from "@/actions/bragDoc";
import type { BragDocResult } from "@/lib/bragDoc";

// §Q4 Brag Doc generator — a date-range-scoped self-review draft, built
// from the user's own logged accomplishments/compensation events. Result
// is ephemeral (not persisted server-side): held in this component's state
// and posted back to /api/career/brag-doc only when the user actually asks
// to download, so a generate-then-abandon never costs a wasted PDF render.
function defaultStartDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BragDocGenerator() {
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [endDate, setEndDate] = useState(defaultEndDate());
  const [bragDoc, setBragDoc] = useState<BragDocResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, startGenerateTransition] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);

  function handleGenerate(): void {
    setError(null);
    setBragDoc(null);
    startGenerateTransition(async () => {
      const result = await generateBragDocAction(startDate, endDate);
      if (!result.success || !result.bragDoc) {
        setError(result.error ?? "Failed to generate your brag doc");
        return;
      }
      setBragDoc(result.bragDoc);
    });
  }

  async function handleDownload(): Promise<void> {
    if (!bragDoc) return;
    setError(null);
    setIsDownloading(true);
    try {
      const response = await fetch("/api/career/brag-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, bragDoc }),
      });
      if (!response.ok) {
        setError("Failed to generate the PDF");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `brag-doc-${startDate}-to-${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[BragDocGenerator] handleDownload", err);
      setError("Failed to download the PDF");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <FileText className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Brag Doc</h2>
      </div>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        Draft a self-review from your own logged accomplishments — ready to reuse for a performance review or
        promotion case.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-secondary p-3">
        <div className="min-w-36 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-text-muted">From</label>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <div className="min-w-36 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-text-muted">To</label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
        <button
          type="button"
          disabled={isGenerating}
          onClick={handleGenerate}
          className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isGenerating ? "Drafting..." : bragDoc ? "Regenerate" : "Generate"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {bragDoc && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="rounded-r-lg border-l-2 border-agent bg-agent-light px-4 py-3">
            <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
              AI Navigator reads
            </p>
            <p className="text-sm leading-6 text-agent-dark">{bragDoc.summary}</p>
          </div>

          {bragDoc.highlights.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Key achievements
              </h3>
              <div className="flex flex-col gap-2.5">
                {bragDoc.highlights.map((h, i) => (
                  <div key={i} className="rounded-xl border border-border bg-surface-secondary p-3.5">
                    <p className="text-sm font-medium text-text-primary">{h.title}</p>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">{h.impact}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bragDoc.skillsShowcased.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Skills demonstrated
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {bragDoc.skillsShowcased.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={isDownloading}
            onClick={handleDownload}
            className="glass-pill inline-flex min-h-9 w-fit items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary transition-colors disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {isDownloading ? "Preparing PDF..." : "Download PDF"}
          </button>
        </div>
      )}
    </section>
  );
}
