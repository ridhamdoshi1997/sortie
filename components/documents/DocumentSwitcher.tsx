"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Mail } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type DocKind = "resume" | "cover_letter";

type Props = {
  jobId: string;
  active: DocKind;
  // Whether the OTHER document (not `active`) has already been generated.
  // Optional so existing call sites that haven't been updated yet still
  // compile — undefined is treated as "exists," i.e. plain navigation,
  // same as this component's behavior before this prop existed.
  otherExists?: boolean;
};

const DOC_META: Record<DocKind, { label: string; icon: typeof FileText; href: (jobId: string) => string }> = {
  resume: { label: "Résumé", icon: FileText, href: (jobId) => `/resume/tailored/${jobId}` },
  cover_letter: { label: "Cover Letter", icon: Mail, href: (jobId) => `/cover-letter/tailored/${jobId}` },
};

// Researched via agy: a per-job document editor doesn't belong in the main
// nav (there's no standalone "cover letters" library the way /resume is a
// real multi-résumé manager — a cover letter only ever exists in relation
// to one job). Instead, cross-link the two per-job workspaces directly so a
// user preparing one job's materials can flip to the other without leaving.
//
// Generate-in-place dialog (2026-08-26, direct user report): clicking the
// other tab when it hasn't been generated yet used to just navigate there
// and let that page's own server-side redirect() bounce back to the
// job-details page — a real dead end, not a real flow. Now it opens a
// confirm dialog offering to generate it right here; only once generation
// actually succeeds does it navigate, so the target page's own redirect()
// guard (still there, for direct URL access) never fires from this path.
export function DocumentSwitcher({ jobId, active, otherExists = true }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherKind: DocKind = active === "resume" ? "cover_letter" : "resume";
  const other = DOC_META[otherKind];
  const current = DOC_META[active];
  const CurrentIcon = current.icon;
  const OtherIcon = other.icon;

  async function handleGenerate(): Promise<void> {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, kind: otherKind }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? `Could not generate the ${other.label.toLowerCase()}.`);
        setGenerating(false);
        return;
      }
      router.push(other.href(jobId));
    } catch {
      setError("Network error — please try again.");
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="inline-flex gap-1 rounded-lg border border-border bg-surface-secondary p-1">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent">
          <CurrentIcon className="h-3.5 w-3.5" />
          {current.label}
        </span>
        {otherExists ? (
          <Link
            href={other.href(jobId)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text-primary"
          >
            <OtherIcon className="h-3.5 w-3.5" />
            {other.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text-primary"
          >
            <OtherIcon className="h-3.5 w-3.5" />
            {other.label}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        tone="neutral"
        eyebrow="Not generated yet"
        title={`Generate a ${other.label.toLowerCase()} for this job?`}
        description={`There's no ${other.label.toLowerCase()} for this job yet. Sortie can tailor one from your profile and this job's posting right now — it opens here once it's ready.`}
        confirmLabel={generating ? "Generating…" : "Generate"}
        pending={generating}
        error={error}
        onConfirm={handleGenerate}
        onCancel={() => {
          if (generating) return;
          setConfirming(false);
          setError(null);
        }}
      />
    </>
  );
}
