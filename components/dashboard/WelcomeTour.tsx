"use client";

import { useEffect, useState } from "react";
import { Briefcase, Compass, FileText, MessagesSquare, Sparkles, X } from "lucide-react";

const STORAGE_KEY = "sortie_welcome_seen";

const AREAS = [
  { icon: Briefcase, title: "Missions", body: "Your application tracker — every job, its real status, and what needs attention next." },
  { icon: Compass, title: "Career", body: "Your private career record — accomplishments, offers, and a timeline that's yours to keep." },
  { icon: FileText, title: "Resume", body: "Tailor a resume per job in a real editor, not just a one-shot PDF generator." },
  { icon: MessagesSquare, title: "Interview", body: "Company-specific prep, cached and reused — grounded in real research, never generic trivia." },
];

// Guided first-run welcome (build-plan.md §H) — a single one-time modal
// rather than a full DOM-positioned spotlight tour (positioning tooltips
// against live elements across a responsive layout is real, separate
// scope-of-its-own risk). Mounted only on /dashboard, the natural first
// landing page after login, gated by a plain localStorage flag so it only
// ever shows once per browser.
export function WelcomeTour() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (!window.localStorage.getItem(STORAGE_KEY)) setOpen(true);
      } catch {
        // localStorage unavailable — skip, never block the dashboard over this
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function dismiss(): void {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-card">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-agent" />
          <h2 className="text-lg font-semibold text-text-primary">Welcome to Sortie</h2>
        </div>
        <p className="mt-1 text-sm text-text-secondary">A quick look at where everything lives.</p>

        <div className="mt-5 flex flex-col gap-4">
          {AREAS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{title}</p>
                <p className="text-xs leading-5 text-text-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          Let&apos;s go
        </button>
      </div>
    </div>
  );
}
