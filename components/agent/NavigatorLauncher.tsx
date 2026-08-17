"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

// Exit animation duration deliberately shorter than the enter (150ms vs
// 220ms, ~68%) — a closing UI should feel more responsive than an opening
// one (Material Design motion guidance). The panel stays mounted for this
// long after `open` flips false so the animate-out classes below actually
// get to play instead of the node just vanishing.
const EXIT_DURATION_MS = 150;

// Mounted once at the root layout. Originally shipped alongside a dedicated
// /agent page (2026-08-14, matching JobRight's Orion having both a page and
// a floating launcher — build-plan.md §O), but the dedicated page was
// removed 2026-08-17 per direct user decision: Navigator is floating-only
// now, this launcher is the only surface for it. Still backed by the same
// persisted agent_messages history either way.
export function NavigatorLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Separate from `open` so the panel can keep rendering (playing its
  // animate-out classes) for EXIT_DURATION_MS after the user closes it,
  // instead of a conditional-render hard unmount with no exit motion.
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<AgentMessageRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jobPageMatch = pathname?.match(JOB_PAGE_PATTERN);
  const contextJobId = jobPageMatch ? jobPageMatch[1] : undefined;

  function openPanel(): void {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setMounted(true);
    setOpen(true);
  }

  function closePanel(): void {
    setOpen(false);
    closeTimeoutRef.current = setTimeout(() => setMounted(false), EXIT_DURATION_MS);
  }

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (open && messages === null) {
      startTransition(async () => {
        const result = await listAgentMessages();
        setMessages(result.data);
      });
    }
  }, [open, messages]);

  // Click-outside and Escape both close it — standard popover affordances,
  // and the fastest way out for someone who just wants the page back.
  useEffect(() => {
    if (!open) return;

    function onClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      // The FAB has to be excluded here, not just the panel — it sits
      // outside panelRef, so without this a mousedown on the FAB itself
      // (while open) reads as an "outside click" and closes the panel
      // BEFORE the FAB's own click handler runs. That handler then fires
      // against the now-stale `open` value and reopens it — a real bug
      // caught live (the FAB appeared to do nothing when clicked to close).
      if (panelRef.current?.contains(target) || fabRef.current?.contains(target)) return;
      closePanel();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closePanel();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!pathname || isPublicRoute(pathname)) {
    return null;
  }

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-label={open ? "Close Navigator" : "Open Navigator"}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-accent text-accent-foreground shadow-lg transition-opacity hover:opacity-90"
      >
        {/* Crossfade + rotate between the two icons instead of an instant
            swap — a purely decorative touch (motion-consistency), so it's
            skipped under prefers-reduced-motion via the motion-reduce
            variant rather than left always-on. */}
        <Sparkles
          className={`absolute h-5 w-5 transition-all duration-200 motion-reduce:transition-none ${
            open ? "rotate-45 opacity-0" : "rotate-0 opacity-100"
          }`}
        />
        <X
          className={`absolute h-5 w-5 transition-all duration-200 motion-reduce:transition-none ${
            open ? "rotate-0 opacity-100" : "-rotate-45 opacity-0"
          }`}
        />
      </button>

      {mounted && (
        <div
          ref={panelRef}
          className={`fixed bottom-24 right-6 z-40 flex h-[32rem] w-[calc(100vw-3rem)] max-w-sm flex-col rounded-2xl border border-border bg-surface p-4 shadow-2xl ${
            open
              ? "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-200"
              : "animate-out fade-out-0 zoom-out-95 slide-out-to-bottom-4 duration-150"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-agent-light text-agent">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <p className="text-sm font-semibold text-text-primary">Navigator</p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close Navigator"
              className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {messages === null ? (
            <p className="text-sm text-text-muted">{isPending ? "Loading..." : "Opening..."}</p>
          ) : (
            <NavigatorChat initialMessages={messages} contextJobId={contextJobId} compact autoFocus={open} />
          )}
        </div>
      )}
    </>
  );
}
