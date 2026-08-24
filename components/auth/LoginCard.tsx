import { ShieldCheck } from "lucide-react";

import { EmailPasswordForm } from "@/components/auth/EmailPasswordForm";
import { GoogleOneTap } from "@/components/auth/GoogleOneTap";
import { AppleIcon, GitHubIcon, GoogleIcon, LinkedInIcon, MicrosoftIcon } from "@/components/auth/BrandIcons";

const errorMessages: Record<string, string> = {
  callback: "We could not finish signing you in. Please try again.",
  oauth: "We could not start that sign-in method. Please try again.",
  provider: "That sign-in method is not available.",
};

type Props = {
  error?: string;
};

// Redesigned 2026-08-20 per agy research on modern dev-tool auth cards
// (Linear/Vercel/Raycast-style): a single centered card, not the previous
// split hero/form layout — research flagged split screens as reading
// "enterprise B2B," which this app's own dark mission-console identity
// doesn't need. Form-first ordering (not OAuth-first, the research's
// general default) was kept per the user's own reference screenshot,
// which explicitly showed credentials first with a provider icon row
// below. Google is the one full-width "primary" provider — the research's
// hybrid pattern for apps supporting more than 2-3 providers — with the
// other four as a secondary icon row, rather than 5 stacked full-width
// buttons or 5 equal-weight icons.
export function LoginCard({ error }: Props) {
  const message = error ? errorMessages[error] : null;

  return (
    <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-[1440px] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <GoogleOneTap />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-card">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-secondary px-3 py-1 text-xs font-medium text-text-secondary">
            <ShieldCheck aria-hidden className="h-4 w-4 text-accent" />
            OAuth secured by InsForge
          </div>
          <h1 className="mt-5 text-2xl font-semibold leading-8 text-text-primary">Sign in to Sortie</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Let the agent prep your next application.
          </p>
        </div>

        {message ? (
          <div className="mt-5 rounded-md border border-error bg-surface px-4 py-3 text-sm font-medium text-error">
            {message}
          </div>
        ) : null}

        <div className="mt-6">
          <EmailPasswordForm />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium text-text-muted">or continue with</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form action="/api/auth/oauth/google" method="get" className="mt-5">
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <GoogleIcon className="h-4.5 w-4.5 text-accent" />
            Continue with Google
          </button>
        </form>

        <div className="mt-3 flex items-center justify-center gap-3">
          <form action="/api/auth/oauth/github" method="get">
            <button
              type="submit"
              aria-label="Continue with GitHub"
              title="Continue with GitHub"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <GitHubIcon className="h-4.5 w-4.5" />
            </button>
          </form>
          <form action="/api/auth/oauth/linkedin" method="get">
            <button
              type="submit"
              aria-label="Continue with LinkedIn"
              title="Continue with LinkedIn"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <LinkedInIcon className="h-4.5 w-4.5" />
            </button>
          </form>
          <form action="/api/auth/oauth/microsoft" method="get">
            <button
              type="submit"
              aria-label="Continue with Microsoft"
              title="Continue with Microsoft"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <MicrosoftIcon className="h-4.5 w-4.5" />
            </button>
          </form>
          <form action="/api/auth/oauth/apple" method="get">
            <button
              type="submit"
              aria-label="Continue with Apple"
              title="Continue with Apple"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <AppleIcon className="h-4.5 w-4.5" />
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-text-muted">New users are routed to profile setup after sign-in.</p>
      </div>
    </section>
  );
}
