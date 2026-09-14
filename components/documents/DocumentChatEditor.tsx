"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, Lock, MessageSquare, Send } from "lucide-react";

import { LimitReachedModal } from "@/components/shared/LimitReachedModal";
import { useDocumentChat, type RevisedData } from "@/components/documents/useDocumentChat";

type Props = {
  jobId: string;
  kind: "resume" | "cover_letter";
  // Only meaningful for a workspace that keeps its own live content/style
  // state in sync with a revision — the job-details page's usage has no
  // such state to update and simply omits this.
  onRevised?: (data: RevisedData) => void;
  /** Pinned under the résumé workspace panel: taller, collapsible thread. */
  docked?: boolean;
};

export function DocumentChatEditor({ jobId, kind, onRevised, docked = false }: Props) {
  const { messages, error, justUpdated, isPending, send, refusal, limit, clearLimit, showLimit, isShared } =
    useDocumentChat({ jobId, kind, onRevised });
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);
  const documentWord = kind === "resume" ? "résumé" : "cover letter";

  // Keeps the newest exchange in view as replies and notices arrive. A DOM
  // write, not state, so it cannot loop.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isPending, refusal, open]);

  function handleSend(e: React.FormEvent): void {
    e.preventDefault();
    if (!input.trim() || isPending) return;
    send(input);
    setInput("");
  }

  const hasThread = messages.length > 0 || isPending || Boolean(refusal);

  return (
    // No own border/background inline (2026-07-28) — a plain top divider reads
    // as a continuation of the card it lives in rather than a separate box.
    <div
      className={
        docked
          ? "flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-5 pb-4 pt-3"
          : "flex flex-col gap-2 border-t border-border pt-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          <MessageSquare className="h-3 w-3" />
          Refine with AI
          {messages.length > 0 && (
            <span className="font-sans normal-case tracking-normal">
              · {messages.length} message{messages.length === 1 ? "" : "s"}
            </span>
          )}
        </p>
        {docked && messages.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-[11px] text-text-muted transition-colors hover:text-text-primary"
          >
            {open ? "Hide history" : "Show history"}
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? "" : "-rotate-90"}`} />
          </button>
        )}
      </div>

      {hasThread && open && (
        <div ref={threadRef} className={`flex flex-col gap-2 overflow-y-auto pr-1 ${docked ? "max-h-64" : "max-h-48"}`}>
          {messages.map((message, i) =>
            message.role === "user" ? (
              <p
                key={i}
                className="max-w-[85%] self-end whitespace-pre-wrap rounded-lg bg-accent-muted px-3 py-1.5 text-xs text-text-primary"
              >
                {message.content}
              </p>
            ) : (
              <p
                key={i}
                className="w-full self-start whitespace-pre-wrap rounded-r-lg border-l-2 border-agent bg-agent-light px-3 py-1.5 text-xs text-agent-dark"
              >
                {message.content}
              </p>
            ),
          )}

          {isPending && (
            <p className="flex items-center gap-1.5 self-start text-xs text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Revising your {documentWord}…
            </p>
          )}

          {/* A refusal answers the message in the thread itself. Before this,
              a capped message sat there with no reply at all, which reads as
              the chat being broken rather than the day's allowance being
              spent. Not agent-toned: this is the app talking, not the AI. */}
          {refusal && !isPending && (
            <div className="self-start rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-primary">
              <p className="flex items-start gap-1.5">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>{refusal.message}</span>
              </p>
              <p className="mt-1 text-text-muted">That message wasn&apos;t applied — nothing in your {documentWord} changed.</p>
              {refusal.canUpgrade && (
                <button type="button" onClick={showLimit} className="mt-1.5 text-xs font-medium text-accent hover:underline">
                  See upgrade options
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isPending}
          placeholder="e.g. Make the summary more concise"
          className={`flex-1 rounded-lg border border-border bg-surface px-3 text-xs text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent disabled:opacity-60 ${docked ? "h-10" : "h-9"}`}
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          aria-label="Send"
          className={`flex shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60 ${docked ? "h-10 w-10" : "h-9 w-9"}`}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Revisions edit THIS document in place — the preview re-renders from
          the saved sections and the download renders from them on demand. The
          old copy promised a new PDF, which stopped being true in Phase 53. */}
      {!isPending && justUpdated && !refusal && (
        <p className="flex items-center gap-1.5 rounded-md bg-success-lightest px-2.5 py-1.5 text-xs font-medium text-success-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Updated your {documentWord} in place{kind === "resume" ? " — the preview shows the change." : "."}
        </p>
      )}
      {error && !isPending && <p className="text-xs text-error">{error}</p>}

      {/* Standalone use (job details, cover letter) renders its own modal. In
          the résumé workspace the shared state renders exactly one. */}
      {limit && !isShared && (
        <LimitReachedModal
          reason={limit.reason}
          featureLabel={kind === "resume" ? "résumé rewrites" : "cover letter rewrites"}
          message={limit.message}
          resetsAt={limit.resetsAt}
          canUpgrade={limit.canUpgrade}
          onClose={clearLimit}
        />
      )}
    </div>
  );
}
