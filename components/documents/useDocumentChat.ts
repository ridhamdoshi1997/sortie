"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition } from "react";

import type { LimitReachedReason } from "@/components/shared/LimitReachedModal";
import type { ScoreJumpResult } from "@/lib/scoreJump";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Set when the server refused because a usage cap was hit, so the caller
 *  can show the real upgrade prompt instead of a red error line. */
export type ChatLimit = { reason: LimitReachedReason; message: string; resetsAt?: string; canUpgrade?: boolean };

export type RevisedData = {
  reply: string;
  sections?: ResumeSection[];
  style?: ResumeStyle;
  scoreJump?: ScoreJumpResult | null;
  // Only meaningful for kind: "cover_letter" — CoverLetterWorkspace's own
  // live content state, the equivalent of `sections` above.
  letterBody?: string;
};

type ChatArgs = {
  jobId: string;
  kind: "resume" | "cover_letter";
  onRevised?: (data: RevisedData) => void;
  /** The saved thread, loaded server-side, so a refresh keeps the conversation. */
  initialMessages?: ChatMessage[];
};

// The request only needs the newest instruction — the route reads the earlier
// thread back from document_chat_messages — but a short tail is still sent as
// a fallback for when that read fails.
const CLIENT_HISTORY_TAIL = 20;

// Shared send/receive logic behind every AI edit surface: the chat box
// (DocumentChatEditor), one-tap presets (RefinementChips), the Action Plan and
// the framework card. `onRevised` is how the résumé workspace's live preview
// picks up a revision immediately, without waiting on router.refresh()'s full
// server-data refetch (which a client component's already-initialized
// useState wouldn't pick up on its own anyway).
export function useDocumentChatState({ jobId, kind, onRevised, initialMessages }: ChatArgs) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<ChatLimit | null>(null);
  // The latest refusal, kept after its modal is closed. Without it, closing
  // the modal left a user message in the thread with no reply and no reason —
  // exactly the "it's not giving me a response" report.
  const [refusal, setRefusal] = useState<ChatLimit | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const [revisionCount, setRevisionCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setError(null);
    setLimit(null);
    setRefusal(null);
    setJustUpdated(false);

    startTransition(async () => {
      try {
        const res = await fetch("/api/documents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, kind, messages: nextMessages.slice(-CLIENT_HISTORY_TAIL) }),
        });
        const json = (await res.json()) as {
          success: boolean;
          data?: RevisedData;
          error?: string;
          reason?: LimitReachedReason;
          resetsAt?: string;
          canUpgrade?: boolean;
        };

        if (!res.ok || !json.success || !json.data) {
          // A cap is not a failure — it is a product state with its own
          // surface. Routed to the modal rather than the error line.
          if (json.reason) {
            const refused: ChatLimit = {
              reason: json.reason,
              message: json.error ?? "You've reached your limit for this.",
              resetsAt: json.resetsAt,
              canUpgrade: json.canUpgrade,
            };
            setLimit(refused);
            setRefusal(refused);
            return;
          }
          setError(json.error ?? "Revision failed. Please try again.");
          return;
        }

        setMessages((prev) => [...prev, { role: "assistant", content: json.data!.reply }]);
        setJustUpdated(true);
        setRevisionCount((n) => n + 1);
        onRevised?.(json.data);
        router.refresh();
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  return {
    messages,
    error,
    limit,
    refusal,
    clearLimit: () => setLimit(null),
    /** Re-opens the upgrade modal for the latest refusal. */
    showLimit: () => setLimit(refusal),
    justUpdated,
    isPending,
    /** Increments on every applied revision — lets usage meters re-read. */
    revisionCount,
    send,
  };
}

export type DocumentChat = ReturnType<typeof useDocumentChatState> & {
  /** True when a workspace owns this state and renders the one limit modal itself. */
  isShared: boolean;
};

const DocumentChatContext = createContext<DocumentChat | null>(null);

// The résumé workspace provides ONE chat state for all of its AI surfaces.
// Each surface used to own a separate copy, so they kept separate threads,
// a refused Action Plan click never showed in the chat, and a limit could
// open up to three modals at once.
export const DocumentChatProvider = DocumentChatContext.Provider;

export function useDocumentChat(args: ChatArgs): DocumentChat {
  const shared = useContext(DocumentChatContext);
  // Always called, so hook order never depends on whether a provider exists.
  const local = useDocumentChatState(args);
  return shared ?? { ...local, isShared: false };
}
