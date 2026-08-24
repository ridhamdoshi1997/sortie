"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Sparkles, User } from "lucide-react";

import { sendAdminAgentMessage } from "@/actions/adminAgent";

type AdminAgentMessageRow = { id: string; role: "user" | "assistant"; content: string; created_at: string };

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Same "- " list-line rendering as consumer NavigatorChat.tsx — no
// markdown library, just this one convention.
function renderMessageContent(content: string) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let proseBuffer: string[] = [];
  let listBuffer: string[] = [];

  function flushProse(key: string) {
    if (proseBuffer.length === 0) return;
    nodes.push(
      <p key={key} className="whitespace-pre-line">
        {proseBuffer.join("\n")}
      </p>,
    );
    proseBuffer = [];
  }
  function flushList(key: string) {
    if (listBuffer.length === 0) return;
    nodes.push(
      <ul key={key} className="list-disc space-y-0.5 pl-4">
        {listBuffer.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  lines.forEach((line, i) => {
    const bulletMatch = line.match(/^[-•]\s+(.*)/);
    if (bulletMatch) {
      flushProse(`p-${i}`);
      listBuffer.push(bulletMatch[1]);
    } else {
      flushList(`l-${i}`);
      if (line.trim()) proseBuffer.push(line);
    }
  });
  flushProse("p-end");
  flushList("l-end");

  return <div className="flex flex-col gap-1.5">{nodes}</div>;
}

// v1 is read-only/drafting-only — no action-proposal cards like consumer
// NavigatorChat.tsx's log_accomplishment. See lib/adminAgentAssistant.ts's
// own comment for why that's deliberate, not missing.
export function AdminNavigatorChat({ initialMessages, autoFocus = false }: { initialMessages: AdminAgentMessageRow[]; autoFocus?: boolean }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isPending]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function handleSend(e: React.FormEvent): void {
    e.preventDefault();
    if (!input.trim() || isPending) return;
    const text = input;
    setInput("");
    setError(null);
    startTransition(async () => {
      const result = await sendAdminAgentMessage(text);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessages(result.messages);
    });
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div ref={scrollRef} className="flex max-h-80 flex-1 flex-col gap-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-text-muted">
            Ask Admin Navigator what needs attention in Support, how usage/spend is trending, or ask it to draft a ticket reply or broadcast.
          </p>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="fade-in-up flex max-w-[85%] items-end gap-2 self-end">
              <div className="flex flex-col items-end gap-0.5">
                <p className="rounded-lg bg-accent-muted px-3 py-2 text-sm text-text-primary">{message.content}</p>
                <span className="pr-1 text-[10px] text-text-muted">{formatMessageTime(message.created_at)}</span>
              </div>
              <div className="mb-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-muted text-accent">
                <User className="h-3 w-3" />
              </div>
            </div>
          ) : (
            <div key={message.id} className="fade-in-up flex max-w-[90%] items-start gap-2 self-start">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-agent-light text-agent">
                <Sparkles className="h-3 w-3" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="w-full rounded-r-lg border-l-2 border-agent bg-agent-light px-3 py-2 text-sm text-agent-dark">
                  {renderMessageContent(message.content)}
                </div>
                <span className="pl-1 text-[10px] text-text-muted">{formatMessageTime(message.created_at)}</span>
              </div>
            </div>
          ),
        )}
        {isPending && (
          <div className="fade-in-up flex items-center gap-2 self-start">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-agent-light text-agent">
              <Sparkles className="h-3 w-3" />
            </div>
            <div className="flex items-center gap-1 rounded-r-lg border-l-2 border-agent bg-agent-light px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-agent motion-reduce:animate-none" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-agent motion-reduce:animate-none" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-agent motion-reduce:animate-none" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border pt-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isPending}
          placeholder="Ask Admin Navigator..."
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
