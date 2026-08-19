"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTicketAsAdmin } from "@/actions/adminSupport";

// Manual ticket creation (direct user request) — for a phone call, a
// walk-up conversation, or any real support contact that didn't come
// through the app or (once configured) email.
export function NewSupportTicketForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTicketAsAdmin(email, subject, note);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/admin/support/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border border-border bg-surface shadow-card rounded-2xl p-6">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-text-muted">User&apos;s email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@email.com"
          required
          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
        />
        <p className="mt-1 text-[11px] text-text-muted">Must be a real, existing Sortie account.</p>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-text-muted">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-text-muted">Opening note</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="What happened, and any context — this is logged as your own note, not written as the user's."
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
        />
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="h-9 w-fit rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        Create ticket
      </button>
    </form>
  );
}
