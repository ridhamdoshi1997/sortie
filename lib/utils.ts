import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Profile URL fields (LinkedIn/portfolio-or-GitHub) are stored as the user
// typed them ("linkedin.com/in/x", no scheme) — a bare href like that is
// treated as relative by both <a> tags and @react-pdf/renderer's <Link>,
// which would navigate within this app instead of out to the real site.
export function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}
// A bare "YYYY-MM-DD" string (accomplishment dates, work_experience start/end
// dates — a calendar day with no time-of-day, not a real timestamp) parses
// via `new Date(string)` as UTC midnight, per the ISO-8601 spec. Formatting
// that in a timezone behind UTC then rolls the displayed day back by one —
// a real bug caught live (Phase 11, Career page epoch restructure): a
// "2022-07-01" start date displayed as "June 30, 2022". Real timestamps
// (found_at, application_status_updated_at) are NOT bare dates — they carry
// genuine time-of-day info, and converting those to the viewer's local
// timezone for display is correct, not a bug — only the date-only case
// needs special handling, via the local-time Date(y, m, d) constructor
// (which never anchors to UTC) instead of the string constructor.
const BARE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(date: Date | string) {
    const parsed =
        typeof date === "string" && BARE_DATE_PATTERN.test(date)
            ? (() => {
                  const [year, month, day] = date.split("-").map(Number);
                  return new Date(year, month - 1, day);
              })()
            : new Date(date);

    return parsed.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

export function formatTimeAgo(date: Date | string) {
    const diffMs = Date.now() - new Date(date).getTime();
    const minutes = Math.round(diffMs / 60_000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;

    const days = Math.round(hours / 24);
    return `${days}d ago`;
}
