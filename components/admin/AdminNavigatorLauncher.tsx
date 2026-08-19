"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, X } from "lucide-react";

import { AdminNavigatorChat } from "@/components/admin/AdminNavigatorChat";
import { listAdminAgentMessages } from "@/actions/adminAgent";

type AdminAgentMessageRow = { id: string; role: "user" | "assistant"; content: string; created_at: string };

const EXIT_DURATION_MS = 150;

// Floating-only, same as consumer NavigatorLauncher.tsx — no dedicated
// page. Mounted once in app/admin/layout.tsx, so it's on every /admin/*
// route including the ones this launcher's own snapshot is grounded in.
export function AdminNavigatorLauncher() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<AdminAgentMessageRow[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const result = await listAdminAgentMessages();
        setMessages(result.success ? result.messages : []);
      });
    }
  }, [open, messages]);

  useEffect(() => {
    if (!open) return;

    function onClickOutside(event: MouseEvent) {
      const target = event.target as Node;
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

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        aria-label={open ? "Close Admin Navigator" : "Open Admin Navigator"}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-accent text-accent-foreground shadow-lg transition-opacity hover:opacity-90"
      >
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
              <p className="text-sm font-semibold text-text-primary">Admin Navigator</p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close Admin Navigator"
              className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {messages === null ? (
            <p className="text-sm text-text-muted">{isPending ? "Loading..." : "Opening..."}</p>
          ) : (
            <AdminNavigatorChat initialMessages={messages} autoFocus={open} />
          )}
        </div>
      )}
    </>
  );
}
