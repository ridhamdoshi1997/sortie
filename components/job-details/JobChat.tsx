"use client";

import { useState, useTransition } from "react";
import { MessageCircle, Send } from "lucide-react";

import { askJobChatAction } from "@/actions/jobChat";
import type { ChatMessage } from "@/lib/jobChat";

// "Ask Navigator" per-job AI chat (build-plan.md §B) — same visual/round-trip
// shape as components/documents/DocumentChatEditor.tsx (chat bubbles +
// input form), reused here for job-fit Q&A instead of document revision.
// Evidence-cited: every reply is grounded in this job's own already-
// computed evaluation, never invented job/company facts.
export function JobChat({ jobId }: { jobId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSend(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);

    startTransition(async () => {
      const result = await askJobChatAction(jobId, nextMessages);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: result.result.reply }]);
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <MessageCircle className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Ask about this job</h2>
      </div>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        Questions about your own evaluation for this role — grounded in the real breakdown above, not general advice.
      </p>

      {messages.length > 0 && (
        <div className="mb-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
          {messages.map((message, i) =>
            message.role === "user" ? (
              <p key={i} className="self-end rounded-lg bg-accent-muted px-3 py-2 text-sm text-text-primary">
                {message.content}
              </p>
            ) : (
              <p key={i} className="w-full self-start rounded-r-lg border-l-2 border-agent bg-agent-light px-3 py-2 text-sm text-agent-dark">
                {message.content}
              </p>
            ),
          )}
          {isPending && <p className="self-start text-xs text-text-muted">Thinking...</p>}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isPending}
          placeholder="e.g. Why did I get a C on System Design?"
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted outline-none focus-visible:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </section>
  );
}
