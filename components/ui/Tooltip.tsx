"use client";

import { useId, useState } from "react";

type Props = {
  content: string;
  children: React.ReactNode;
};

// First real Tooltip primitive in this codebase (no Radix/headless-UI
// dependency anywhere — see ConfirmDialog.tsx/Tabs.tsx for the same
// hand-rolled convention). Escape-to-close from the start, matching the
// accessibility-audit fix already applied to every other popover/dropdown
// in this app (build-plan.md §H — none of them closed on Escape until that
// pass; no reason for a brand-new component to reintroduce the same gap).
export function Tooltip({ content, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <span aria-describedby={open ? id : undefined} tabIndex={0} className="cursor-help outline-none">
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-5 text-text-secondary shadow-card"
        >
          {content}
        </span>
      )}
    </span>
  );
}
