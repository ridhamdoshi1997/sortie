"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Trash2 } from "lucide-react";

import { deleteTailoredResume } from "@/actions/resumes";

export function TailoredResumeCard({
  jobId,
  title,
  company,
}: {
  jobId: string;
  title: string;
  company: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete the tailored résumé for "${title}"? This can't be undone.`)) return;
    setPending(true);
    const result = await deleteTailoredResume(jobId);
    setPending(false);
    if (!result.success) {
      window.alert(result.error ?? "Failed to delete this tailored résumé.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-secondary">
      <Link href={`/resume/tailored/${jobId}`} className="flex flex-1 items-center gap-3">
        <FileText className="h-5 w-5 text-agent" />
        <div>
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          <p className="text-xs text-text-muted">{company}</p>
        </div>
      </Link>
      <a
        href={`/api/documents/download?jobId=${jobId}&kind=resume`}
        target="_blank"
        rel="noreferrer"
        aria-label="Download tailored résumé"
        className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
      >
        <Download className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        aria-label="Delete tailored résumé"
        className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
