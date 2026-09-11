"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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

// Shared send/receive logic behind both DocumentChatEditor (the visible chat
// box) and RefinementChips (one-tap preset prompts) — extracted so a chip
// click and a typed message go through the exact same round trip instead of
// two divergent implementations. `onRevised` is how the résumé workspace's
// live preview picks up a revision immediately, without waiting on
// router.refresh()'s full server-data refetch (which a client component's
// already-initialized useState wouldn't pick up on its own anyway).
export function useDocumentChat({
  jobId,
  kind,
  onRevised,
}: {
  jobId: string;
  kind: "resume" | "cover_letter";
  onRevised?: (data: RevisedData) => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<ChatLimit | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const [isPending, startTransition] = useTransition();

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setError(null);
    setLimit(null);
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
            setLimit({
              reason: json.reason,
              message: json.error ?? "You've reached your limit for this.",
              resetsAt: json.resetsAt,
              canUpgrade: json.canUpgrade,
            });
            return;
          }
          setError(json.error ?? "Revision failed. Please try again.");
          return;
        }

        setMessages((prev) => [...prev, { role: "assistant", content: json.data!.reply }]);
        setJustUpdated(true);
        onRevised?.(json.data);
        router.refresh();
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    });
  }

  return { messages, error, limit, clearLimit: () => setLimit(null), justUpdated, isPending, send };
}
