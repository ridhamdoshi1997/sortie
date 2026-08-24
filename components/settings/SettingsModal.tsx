"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";

import { SettingsPanel } from "@/components/settings/SettingsPanel";

// URL-driven, not local React state — a bookmarkable/shareable link to
// settings (?settings=1) and working browser back/forward are both real
// requirements for a modal that replaces a dedicated page, not just a
// nice-to-have. /settings itself still exists as a real page (app/settings/
// page.tsx) as a no-JS/hard-refresh fallback; this is the primary path for
// everyone else. Pattern and reasoning from a 2026-07-29 research pass
// (Gemini 3.1 Pro via agy) on how premium SaaS (Linear, Superhuman) handles
// settings — a centered "OS window" modal over the current page, not a
// full-page navigation that loses context.
export function SettingsModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOpen = searchParams.get("settings") === "1";

  const [data, setData] = useState<{ email: string; providers: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("settings");
    const query = params.toString();
    router.push(query ? `?${query}` : window.location.pathname, { scroll: false });
  }, [router, searchParams]);

  // Cmd/Ctrl+, — the OS-level muscle memory for "Preferences," per the same
  // research pass. Global: works from anywhere, not just when already on a
  // settings-adjacent page.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        if (!isOpen) {
          const params = new URLSearchParams(searchParams);
          params.set("settings", "1");
          router.push(`?${params.toString()}`, { scroll: false });
        }
      }
      if (event.key === "Escape" && isOpen) {
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, router, searchParams, close]);

  // Depends on isOpen ALONE, not [isOpen, data] — an earlier version
  // included data in the dependency array as a "don't refetch if we already
  // have it" guard, but since this effect's own setData call changes data,
  // that created a feedback loop where the effect's cleanup (from the
  // data-triggered re-run) raced the in-flight fetch. Reset-to-null-on-close
  // lives in the cleanup function instead of a separate "adjust state during
  // render" block — cleanup functions calling setState are the standard,
  // lint-endorsed pattern (unlike a synchronous setState in the effect body
  // itself, which react-hooks/set-state-in-effect correctly flags).
  //
  // A second, separate bug (the real cause of a cold-load-with-?settings=1
  // hang) turned out to be where this component was mounted, not this
  // effect — see components/settings/SettingsModalLoader.tsx's comment.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch("/api/settings/me")
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load settings. Please try again.");
      });
    return () => {
      cancelled = true;
      setData(null);
      setError(null);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        className="glass-panel-strong flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-text-primary">Settings</h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close settings"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && <p className="py-16 text-center text-sm text-error">{error}</p>}
          {!error && !data && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          )}
          {data && <SettingsPanel email={data.email} providers={data.providers} />}
        </div>
      </div>
    </div>
  );
}
