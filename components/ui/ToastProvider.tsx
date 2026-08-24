"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

// Toast notification system infra (build-plan.md §H). Wired into 1-2 real
// spots as a proof of concept (AddToCompareButton.tsx) rather than a mass
// retrofit of every existing inline success/error message in the app —
// most of those already have adequate inline feedback, and touching all of
// them in one pass would be real, unjustified regression risk.
export type ToastVariant = "success" | "error" | "info";
type ToastItem = { id: number; message: string; variant: ToastVariant };

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof CheckCircle2; className: string }> = {
  success: { icon: CheckCircle2, className: "border-agent/30 bg-agent-light text-agent-dark" },
  error: { icon: XCircle, className: "border-error/30 bg-error/10 text-error" },
  info: { icon: Info, className: "border-border bg-surface text-text-primary" },
};

const ToastContext = createContext<{ showToast: (message: string, variant?: ToastVariant) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const AUTO_DISMISS_MS = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, variant }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => {
          const { icon: Icon, className } = VARIANT_STYLES[toast.variant];
          return (
            <div
              key={toast.id}
              role="status"
              className={`toast-enter pointer-events-auto flex max-w-xs items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm shadow-card ${className}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1 leading-5">{toast.message}</span>
              <button
                type="button"
                onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
                aria-label="Dismiss"
                className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
