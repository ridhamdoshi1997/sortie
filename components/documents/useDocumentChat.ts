"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ScoreJumpResult } from "@/lib/scoreJump";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type RevisedData = {
  reply: string;
  sections?: ResumeSection[];
  style?: ResumeStyle;
  scoreJump?: ScoreJumpResult | null;
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
  const [justUpdated, setJustUpdated] = useState(false);
  const [isPending, startTransition] = useTransition();

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
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
          data?: RevisedData;
          error?: string;
        };

        if (!res.ok || !json.success || !json.data) {
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

  return { messages, error, justUpdated, isPending, send };
}
