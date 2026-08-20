"use client";

import { useState, type ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
  content: ReactNode;
};

type Props = {
  tabs: Tab[];
  defaultTabId?: string;
};

export function Tabs({ tabs, defaultTabId }: Props) {
  const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id);
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div className="flex flex-col gap-6" style={{ width: "100%" }}>
      {/* Mobile fix (ui-rules.md's standing mobile-responsive rule): this
         was a plain `flex w-fit shrink-0` row with no wrap/scroll handling
         — fine on desktop, but a 4-tab set with a longer label ("Work
         Experience", ProfileForm.tsx) sits right at the edge of a real
         375px viewport with zero margin for a slightly wider font render,
         and would silently push the page into horizontal scroll rather
         than failing loudly. `overflow-x-auto` on the tablist itself
         contains any overflow to the pill bar (real native touch-scroll),
         never the page; `w-full sm:w-fit` keeps desktop's original
         compact/centered sizing unchanged. */}
      <div
        role="tablist"
        className="flex w-full shrink-0 gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 sm:w-fit"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveId(tab.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent-light text-accent"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {/* Inline style, not a Tailwind class — a prior w-full utility class
         attempt here made no visible difference even after a full dev
         server restart, which rules out cascade-layer/HMR staleness and
         points at something the utility layer itself isn't winning
         against. Inline style has the highest possible specificity short
         of !important, so this isolates whether the fix works at all. */}
      <div role="tabpanel" style={{ width: "100%", minWidth: 0 }}>
        {activeTab?.content}
      </div>
    </div>
  );
}
