"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ComponentType } from "react";
import { FileText, Mail, Sparkles } from "lucide-react";

import { DocumentChatEditor } from "@/components/job-details/DocumentChatEditor";

type DocumentKind = "resume" | "cover_letter";

type Props = {
  jobId: string;
  resumePdfUrl: string | null;
  coverLetterPdfUrl: string | null;
};

type ActionProps = {
  jobId: string;
  kind: DocumentKind;
  label: string;
  hasDocument: boolean;
  icon: ComponentType<{ className?: string }>;
};

function DocumentAction({ jobId, kind, label, hasDocument, icon: Icon }: ActionProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate(): void {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/documents/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, kind }),
        });
        const json = (await res.json()) as { success: boolean; error?: string };

        if (!res.ok || !json.success) {
          setError(json.error ?? "Generation failed. Please try again.");
          return;
        }

        router.refresh();
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-muted text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold leading-5 text-text-primary">{label}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={isPending}
          onClick={handleGenerate}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? "Generating..." : hasDocument ? "Regenerate" : "Generate"}
        </button>
        {hasDocument && (
          <a
            href={`/api/documents/download?jobId=${jobId}&kind=${kind}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-accent hover:underline"
          >
            View {label}
          </a>
        )}
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {hasDocument && <DocumentChatEditor jobId={jobId} kind={kind} />}
    </div>
  );
}

export function DocumentGenerator({ jobId, resumePdfUrl, coverLetterPdfUrl }: Props) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-center gap-3 border-b border-border p-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
          <Sparkles className="h-4 w-4 text-accent" />
        </div>
        <h2 className="text-base font-semibold leading-6 text-text-primary">
          Application Documents
        </h2>
      </div>

      <div className="flex flex-col gap-4 p-6 sm:flex-row">
        <DocumentAction
          jobId={jobId}
          kind="resume"
          label="Tailored Resume"
          hasDocument={!!resumePdfUrl}
          icon={FileText}
        />
        <DocumentAction
          jobId={jobId}
          kind="cover_letter"
          label="Cover Letter"
          hasDocument={!!coverLetterPdfUrl}
          icon={Mail}
        />
      </div>
    </section>
  );
}
