"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toUserMessage } from "@/lib/errors";

// Next.js's own uncaught-render fallback ("An error occurred in the Server
// Components render. The specific message is omitted...") was leaking
// straight into the page — this route-level boundary (App Router
// convention: app/error.tsx catches errors anywhere under it) replaces
// that with the same professional-copy treatment the rest of the app uses,
// styled like ConfirmDialog.tsx's icon-badge + title/body pattern.
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="flex min-h-screen items-center justify-center p-6">
            <div className="glass-panel-strong w-full max-w-md rounded-2xl p-8 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-error">
                    <AlertTriangle className="h-6 w-6" />
                </span>
                <h1 className="mt-4 text-lg font-semibold text-text-primary">Something went wrong</h1>
                <p className="mt-2 text-sm leading-5 text-text-secondary">
                    {toUserMessage(error, "We hit an unexpected issue loading this page. Please try again.")}
                </p>
                <div className="mt-6 flex items-center justify-center gap-3">
                    <Link
                        href="/dashboard"
                        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
                    >
                        Back to dashboard
                    </Link>
                    <Button onClick={reset} className="bg-accent text-accent-foreground hover:opacity-90">
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Try again
                    </Button>
                </div>
            </div>
        </div>
    );
}
