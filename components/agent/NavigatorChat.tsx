"use client";

import { useState, useTransition } from "react";
import { Check, Send, Sparkles, X } from "lucide-react";

import { confirmAgentAction, sendAgentMessage } from "@/actions/agent";
import type { AgentAction } from "@/lib/agentAssistant";

type AgentMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action_payload: AgentAction | null;
  action_executed_at: string | null;
  created_at: string;
};

// Navigator's replies use plain "- " prefixed lines for lists (per the
// system prompt), not markdown — no markdown-rendering library is added
// just for this. Splits a reply into leading prose + a real <ul> for any
// contiguous run of "- " lines, since a flat <p> collapses newlines and
// turns a list into one dense paragraph (real bug, caught live).
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

type Props = {
  initialMessages: AgentMessageRow[];
  contextJobId?: string;
  // Smaller max-height + tighter padding for the floating launcher's
  // popover — same component, same shared conversation, just a smaller
  // viewport (matches DocumentChatEditor.tsx's compact-by-default sizing).
  compact?: boolean;
};

// Navigator (build-plan.md §O) — shared between the full /agent page and the
// floating launcher's popover, both reading/writing the same persisted
// agent_messages history (unlike DocumentChatEditor's ephemeral per-session
// state). Bubble styling matches DocumentChatEditor.tsx exactly; the
// action-proposal card matches EditorTab.tsx's BulletDiffCard (agent-teal,
// Accept/Discard) rather than the red ConfirmDialog treatment, since this is
// an AI suggestion to review, not a destructive confirmation.
export function NavigatorChat({ initialMessages, contextJobId, compact = false }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSend(e: React.FormEvent): void {
    e.preventDefault();
    if (!input.trim() || isPending) return;
    const text = input;
    setInput("");
    setError(null);
    startTransition(async () => {
      const result = await sendAgentMessage(text, contextJobId);
      if (!result.success) {
        setError(result.error ?? "Failed to send message.");
        return;
      }
      setMessages(result.messages ?? []);
    });
  }

  function handleConfirm(messageId: string): void {
    setConfirmingId(messageId);
    startTransition(async () => {
      const result = await confirmAgentAction(messageId);
      setConfirmingId(null);
      if (!result.success) {
        setError(result.error ?? "Failed to confirm.");
        return;
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, action_executed_at: new Date().toISOString() } : m)),
      );
    });
  }

  function handleDiscard(messageId: string): void {
    setDiscardedIds((prev) => new Set(prev).add(messageId));
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        className={`flex flex-1 flex-col gap-3 overflow-y-auto ${compact ? "max-h-80" : "min-h-[24rem]"}`}
      >
        {messages.length === 0 && (
          <p className="text-sm text-text-muted">
            Ask Navigator about your match score, what needs attention on your tracker, or tell it about
            something you did to log it to your Career Record.
          </p>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <p
              key={message.id}
              className="max-w-[85%] self-end rounded-lg bg-accent-muted px-3 py-2 text-sm text-text-primary"
            >
              {message.content}
            </p>
          ) : (
            <div key={message.id} className="flex max-w-[90%] flex-col gap-2 self-start">
              <div className="w-full rounded-r-lg border-l-2 border-agent bg-agent-light px-3 py-2 text-sm text-agent-dark">
                {renderMessageContent(message.content)}
              </div>
              {message.action_payload &&
                message.action_payload.type === "log_accomplishment" &&
                !message.action_executed_at &&
                !discardedIds.has(message.id) && (
                  <div className="flex flex-col gap-2 rounded-lg border border-agent/30 bg-agent-light/50 p-2.5">
                    <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-agent">
                      <Sparkles className="h-3 w-3" />
                      Log to Career Record
                    </p>
                    <p className="text-sm font-medium text-agent-dark">{message.action_payload.title}</p>
                    <p className="text-xs text-agent-dark">{message.action_payload.description}</p>
                    <div className="flex items-center gap-3 pt-0.5">
                      <button
                        type="button"
                        disabled={confirmingId === message.id}
                        onClick={() => handleConfirm(message.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-agent px-2.5 py-1 text-[11px] font-medium text-agent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" /> Accept
                      </button>
                      <button
                        type="button"
                        disabled={confirmingId === message.id}
                        onClick={() => handleDiscard(message.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted hover:text-error disabled:opacity-50"
                      >
                        <X className="h-3 w-3" /> Discard
                      </button>
                    </div>
                  </div>
                )}
              {message.action_payload && message.action_executed_at && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-success-foreground">
                  <Check className="h-3.5 w-3.5" /> Logged to your Career Record
                </p>
              )}
            </div>
          ),
        )}
        {isPending && <p className="text-xs text-text-muted">Navigator is thinking...</p>}
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isPending}
          placeholder="Ask Navigator anything..."
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
