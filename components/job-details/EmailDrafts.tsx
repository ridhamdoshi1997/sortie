"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Mail, Sparkles } from "lucide-react";

import { generateEmailDraftAction } from "@/actions/emailDrafts";
import type { EmailDraft, EmailDraftType } from "@/lib/emailDrafts";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

const TYPES: Array<{ key: EmailDraftType; label: string }> = [
  { key: "cold_application", label: "Cold application" },
  { key: "follow_up", label: "Follow-up" },
  { key: "thank_you", label: "Thank-you" },
];

// Application email drafts (build-plan.md §C, Phase 11/F31 + the follow-up/
// thank-you item). Ephemeral, not persisted — same "AI drafts, human
// reviews and sends themselves" discipline as every other draft-generation
// surface in this app; never wired to an actual send action.
export function EmailDrafts({ jobId }: { jobId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [type, setType] = useState<EmailDraftType>("cold_application");
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);
  const [isPending, startTransition] = useTransition();

  // Deep-link support: FollowUpNudge.tsx links here with `?draft=follow_up`
  // so the nudge lands the user already on the right tab instead of making
  // them find it themselves. Watches searchParams (not just mount) since
  // FollowUpNudge lives on this same page — a query-param-only Link click
  // doesn't remount this component, it's a same-route param change.
  useEffect(() => {
    const requested = searchParams.get("draft");
    if (requested !== "follow_up") return;
    const timer = setTimeout(() => {
      setType("follow_up");
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      const params = new URLSearchParams(searchParams);
      params.delete("draft");
      const query = params.toString();
      router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [searchParams, router]);

  function handleGenerate(): void {
    setError(null);
    setDraft(null);
    startTransition(async () => {
      const result = await generateEmailDraftAction(jobId, type);
      if (result.success) setDraft(result.draft);
      else setError(result.error);
    });
  }

  function handleCopy(field: "subject" | "body", value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <section ref={containerRef} className="border border-border bg-surface shadow-card overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-border p-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
          <Mail className="h-4 w-4 text-accent" />
        </div>
        <h2 className="text-base font-semibold leading-6 text-text-primary">Email Drafts</h2>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setType(t.key);
                setDraft(null);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                type === t.key ? "bg-accent text-accent-foreground" : "border border-border text-text-secondary hover:bg-surface-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={handleGenerate}
          className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg border border-agent/30 bg-agent-light px-4 text-sm font-medium text-agent-dark transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {isPending ? "Drafting…" : draft ? "Regenerate" : "Generate draft"}
        </button>

        {error && <p className="text-xs text-error">{error}</p>}

        {isPending && <AiThinkingCard status="Drafting your email…" />}

        {!isPending && draft && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Subject</p>
                <p className="mt-0.5 text-sm font-medium text-text-primary">{draft.subject}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy("subject", draft.subject)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface"
              >
                {copied === "subject" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === "subject" ? "Copied" : "Copy"}
              </button>
            </div>

            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Body</p>
                <button
                  type="button"
                  onClick={() => handleCopy("body", draft.body)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface"
                >
                  {copied === "body" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied === "body" ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1 whitespace-pre-line text-sm leading-6 text-text-secondary">{draft.body}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
