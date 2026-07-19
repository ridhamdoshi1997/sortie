import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Props = {
  applyUrl: string | null;
  company: string;
  showBackLink?: boolean;
  showApplyButton?: boolean;
};

export function JobActions({
  applyUrl,
  company,
  showBackLink = false,
  showApplyButton = false,
}: Props) {
  return (
    <>
      {showBackLink && (
        <Link
          href="/find-jobs"
          className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs
        </Link>
      )}

      {showApplyButton &&
        (applyUrl ? (
          <Link
            href={applyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Apply Now at {company}
          </Link>
        ) : (
          <div
            className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-lg border border-border bg-surface-secondary px-4 py-3 text-sm font-medium text-text-muted"
            title="No application link was saved for this job"
          >
            No application link available
          </div>
        ))}
    </>
  );
}
