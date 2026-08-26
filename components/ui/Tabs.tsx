"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

  // Mobile discoverability fix (direct user report, 2026-08-26) — the
  // `overflow-x-auto` tablist scrolls fine on a touch device, but a plain
  // hard clip at the container edge gives no visual hint there's anything
  // past it; a tab set that happens to end flush with the viewport (as
  // "Resume Evolution" did on job-detail at 375px) reads as the complete
  // list, not a truncated one. Real overflow state (not a static always-on
  // fade, which would misleadingly hint at more content on a tab set that
  // already fits) drives two edge fades — only rendered on the side there's
  // actually something to scroll to, and re-checked on resize/scroll/tab
  // list changes since which side has overflow changes as the user scrolls.
  const listRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    function measure() {
      if (!el) return;
      setOverflow({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    }

    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      resizeObserver.disconnect();
    };
  }, [tabs]);

  // Direct user decision (2026-08-26): the fade alone signals overflow but
  // still requires a swipe gesture some users won't try on a tab strip;
  // these buttons give an explicit tap-to-scroll path alongside it. One
  // tab's worth of scroll per tap (clientWidth * 0.6, not the full width)
  // so the previously-partial edge tab lands fully visible as a landing
  // point instead of jumping a full page and losing context.
  function scrollByDirection(direction: "left" | "right"): void {
    const el = listRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -el.clientWidth * 0.6 : el.clientWidth * 0.6, behavior: "smooth" });
  }

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
      {/* Underline tabs, not a filled pill (professional-polish pass,
         2026-08-25) — the previous `bg-accent-light text-accent` active
         state read fine in light mode but resolved to `--color-accent-light:
         #451a03` in dark mode, a muddy near-black brown with almost no
         presence against this app's near-black dark surfaces (confirmed via
         getComputedStyle). That token is tuned for a subtle badge wash, not
         a primary navigation indicator. A real accent-colored underline
         uses `--color-accent` itself, which stays a genuinely vivid amber
         in both themes, and reads closer to Linear/Vercel's own tab bars. */}
      <div className="relative">
        <div
          ref={listRef}
          role="tablist"
          className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-border sm:w-fit sm:gap-2"
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
                className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-accent text-text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {/* Edge fade (decorative, pointer-events-none) plus a real
           tap-to-scroll button layered on top — the fade alone still
           depended on a user trying a swipe gesture on what reads as a
           row of buttons, not an obviously-scrollable strip; the button
           gives an explicit, discoverable path to the same scroll (direct
           user decision, 2026-08-26). Mobile/tablet only (sm:hidden) —
           desktop's sm:w-fit tab row doesn't overflow. */}
        {overflow.left && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent sm:hidden"
            />
            <button
              type="button"
              onClick={() => scrollByDirection("left")}
              aria-label="Scroll tabs left"
              className="absolute left-0.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-card sm:hidden"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {overflow.right && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent sm:hidden"
            />
            <button
              type="button"
              onClick={() => scrollByDirection("right")}
              aria-label="Scroll tabs right"
              className="absolute right-0.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-text-secondary shadow-card sm:hidden"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
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
