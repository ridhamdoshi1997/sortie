import Link from "next/link";
import { FileText, Mail } from "lucide-react";

type Props = { jobId: string; active: "resume" | "cover_letter" };

// Researched via agy: a per-job document editor doesn't belong in the main
// nav (there's no standalone "cover letters" library the way /resume is a
// real multi-résumé manager — a cover letter only ever exists in relation
// to one job). Instead, cross-link the two per-job workspaces directly so a
// user preparing one job's materials can flip to the other without leaving.
// If the target document hasn't been generated yet, its own page redirects
// back to the job-details page — no need to precompute that here.
export function DocumentSwitcher({ jobId, active }: Props) {
  return (
    <div className="inline-flex gap-1 rounded-lg border border-border bg-surface-secondary p-1">
      <Link
        href={`/resume/tailored/${jobId}`}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
          active === "resume" ? "bg-accent-muted text-accent" : "text-text-muted hover:text-text-primary"
        }`}
      >
        <FileText className="h-3.5 w-3.5" />
        Résumé
      </Link>
      <Link
        href={`/cover-letter/tailored/${jobId}`}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
          active === "cover_letter" ? "bg-accent-muted text-accent" : "text-text-muted hover:text-text-primary"
        }`}
      >
        <Mail className="h-3.5 w-3.5" />
        Cover Letter
      </Link>
    </div>
  );
}
