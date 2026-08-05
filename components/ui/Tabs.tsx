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
      <div
        role="tablist"
        className="flex w-fit shrink-0 gap-1 rounded-full border border-border bg-surface p-1"
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
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
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
