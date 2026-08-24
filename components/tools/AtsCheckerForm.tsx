"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Sparkles, Upload } from "lucide-react";

import { extractResumeTextFromPdf } from "@/actions/publicTools";
import type { PublicAtsResult } from "@/lib/publicAtsChecker";

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-error";
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-5xl font-bold ${color}`}>{score}</span>
      <span className="text-xs uppercase tracking-wide text-text-muted">out of 100</span>
    </div>
  );
}

export function AtsCheckerForm() {
  const [resumeText, setResumeText] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [result, setResult] = useState<PublicAtsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setError(null);
    setIsExtracting(true);
    const formData = new FormData();
    formData.append("resume", file);

    extractResumeTextFromPdf(formData)
      .then((result) => {
        if (result.success) {
          setResumeText(result.text);
        } else {
          setError(result.error);
        }
      })
      .finally(() => setIsExtracting(false));
  }

  function handleSubmit(): void {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/tools/ats-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText, jobDescriptionText }),
        });
        const json = (await res.json()) as { success: boolean; result?: PublicAtsResult; error?: string };
        if (!res.ok || !json.success) {
          setError(json.error ?? "Something went wrong — please try again.");
          return;
        }
        setResult(json.result ?? null);
      } catch {
        setError("Network error — please check your connection and try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">Your resume text</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtracting}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {isExtracting ? "Reading PDF..." : "Upload PDF instead"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          <textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={12}
            placeholder="Paste your resume text here, or upload a PDF above..."
            className="rounded-lg border border-border bg-surface p-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <span className="text-xs text-text-muted">PDF only, under 2MB — extracted text lands here so you can check or edit it before submitting.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">Job description (optional, for keyword match)</span>
          <textarea
            value={jobDescriptionText}
            onChange={(e) => setJobDescriptionText(e.target.value)}
            rows={12}
            placeholder="Paste a job description to also check keyword coverage..."
            className="rounded-lg border border-border bg-surface p-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={isPending || resumeText.trim().length < 100}
        onClick={handleSubmit}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-accent px-6 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" />
        {isPending ? "Analyzing..." : "Check my resume"}
      </button>

      {error && <p className="text-sm text-error">{error}</p>}

      {result && (
        <div className="flex flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-card">
          <div className="flex flex-col items-center gap-4 border-b border-border pb-6 sm:flex-row sm:justify-between">
            <ScoreRing score={result.overallScore} />
            <p className="max-w-md text-center text-sm text-text-secondary sm:text-left">
              A general AI-judged read from your pasted text — not a structural parse of real formatting. For a
              precise, per-job check, Sortie&apos;s own resume workspace scores your actual document.
            </p>
          </div>

          {result.formattingFlags.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Formatting &amp; structure</h3>
              <ul className="flex flex-col gap-2">
                {result.formattingFlags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-6 text-text-secondary">
                    {flag.severity === "warning" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                    )}
                    {flag.note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.keywordCoverage && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Keyword coverage vs. the job description</h3>
              <div className="flex flex-wrap gap-2">
                {result.keywordCoverage.matched.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-full bg-success-lightest px-2.5 py-1 text-xs font-medium text-success-foreground">
                    <CheckCircle2 className="h-3 w-3" />
                    {k}
                  </span>
                ))}
                {result.keywordCoverage.missing.map((k) => (
                  <span key={k} className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-text-muted">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text-primary">Suggestions</h3>
            <ul className="flex flex-col gap-2">
              {result.suggestions.map((s, i) => (
                <li key={i} className="text-sm leading-6 text-text-secondary">
                  • {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col items-center gap-3 rounded-xl border border-agent/30 bg-agent-light/40 p-5 text-center">
            <p className="text-sm font-medium text-agent-dark">
              Sortie scores your resume against every real job you look at — 10 dimensions, not just one number.
            </p>
            <Link
              href="/login"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              Try it free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
