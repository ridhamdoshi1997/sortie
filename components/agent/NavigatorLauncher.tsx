"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";

import { NavigatorChat } from "@/components/agent/NavigatorChat";
import { listAgentMessages } from "@/actions/agent";
import type { AgentAction } from "@/lib/agentAssistant";

type AgentMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action_payload: AgentAction | null;
  action_executed_at: string | null;
  created_at: string;
};

const JOB_PAGE_PATTERN = /^\/find-jobs\/([0-9a-f-]{36})/i;

// Every action Navigator can take requires a logged-in user (sendAgentMessage
// calls requireUser() internally) — showing the launcher on genuinely public
// routes (marketing homepage, auth, waitlist, design previews) would either
// do nothing useful or surface a raw auth error on first click. This app has
// no shared "authenticated layout" to read auth state from at the root
// (every page composes <Navbar isAuthenticated /> itself, confirmed — see
// build-plan.md §O's implementation notes), so gating by known-public path
// prefixes is the pragmatic equivalent without adding a client-side auth
// check just for this.
function isPublicRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/login" || pathname === "/waitlist" || pathname.startsWith("/preview");
}

// Mounted once at the root layout, per JobRight's Orion having both a
// dedicated page AND a floating launcher (2026-08-14 direction, reversing
// the earlier page-only decision recorded in build-plan.md §O). Shares the
// same persisted agent_messages history as the full /agent page — this is
// just a smaller viewport onto the same conversation, not a separate one.
export function NavigatorLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessageRow[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const jobPageMatch = pathname?.match(JOB_PAGE_PATTERN);
  const contextJobId = jobPageMatch ? jobPageMatch[1] : undefined;

  useEffect(() => {
    if (open && messages === null) {
      startTransition(async () => {
        const result = await listAgentMessages();
        setMessages(result.data);
      });
    }
  }, [open, messages]);

  if (!pathname || isPublicRoute(pathname) || pathname === "/agent") {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Navigator" : "Open Navigator"}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition-opacity hover:opacity-90"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 flex h-[32rem] w-[calc(100vw-3rem)] max-w-sm flex-col rounded-2xl border border-border bg-surface p-4 shadow-2xl">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-agent-light text-agent">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <p className="text-sm font-semibold text-text-primary">Navigator</p>
          </div>

          {messages === null ? (
            <p className="text-sm text-text-muted">{isPending ? "Loading..." : "Opening..."}</p>
          ) : (
            <NavigatorChat initialMessages={messages} contextJobId={contextJobId} compact />
          )}
        </div>
      )}
    </>
  );
}
