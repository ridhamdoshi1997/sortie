"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Send, CheckCircle2 } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  jobId: string;
  kind: "resume" | "cover_letter";
};

export function DocumentChatEditor({ jobId, kind }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSend(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setJustUpdated(false);

    startTransition(async () => {
      try {
        const res = await fetch("/api/documents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, kind, messages: nextMessages }),
        });
        const json = (await res.json()) as {
          success: boolean;
          data?: { reply: string };
          error?: string;
        };

        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? "Revision failed. Please try again.");
          return;
        }

        setMessages((prev) => [...prev, { role: "assistant", content: json.data!.reply }]);
        setJustUpdated(true);
        router.refresh();
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  return (
    // No own border/background (2026-07-28) — this used to be a 3rd nested
    // surface tone (bg-surface, inside DocumentAction's bg-surface-secondary,
    // inside DocumentGenerator's bg-surface). A plain top divider reads as a
    // continuation of the card it lives in rather than a separate box.
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        Refine with AI
      </p>

      {messages.length > 0 && (
        <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
          {messages.map((message, i) =>
            message.role === "user" ? (
              <p
                key={i}
                className="self-end rounded-lg bg-accent-muted px-3 py-1.5 text-xs text-text-primary"
              >
                {message.content}
              </p>
            ) : (
              <p
                key={i}
                className="w-full self-start rounded-r-lg border-l-2 border-agent bg-agent-light px-3 py-1.5 text-xs text-agent-dark"
              >
                {message.content}
              </p>
            ),
          )}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isPending}
          placeholder="e.g. Make the summary more concise"
          className="h-9 flex-1 rounded-lg border border-border bg-surface px-3 text-xs text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {isPending && <p className="text-xs text-text-muted">Revising...</p>}
      {!isPending && justUpdated && (
        <p className="flex items-center gap-1.5 rounded-md bg-success-lightest px-2.5 py-1.5 text-xs font-medium text-success-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          New PDF generated with these changes — click &quot;View&quot; above to see it.
        </p>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
