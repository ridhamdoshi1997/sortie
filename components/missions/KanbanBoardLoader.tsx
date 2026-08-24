"use client";

import dynamic from "next/dynamic";

import type { KanbanJob } from "@/components/missions/KanbanCard";

// @dnd-kit's DndContext generates its aria-describedby id from an internal
// instance counter — confirmed live: this mismatched between the SSR pass
// and the client's first render ("DndDescribedBy-0" vs "DndDescribedBy-1"),
// a real hydration warning, not a stale-cache artifact (persisted across a
// hard reload). An explicit `id` prop on DndContext didn't resolve it.
// Same fix as SettingsModalLoader.tsx for an analogous SSR-vs-client-only
// component problem: `ssr:false` means this never participates in SSR at
// all, so there's nothing for the client to mismatch against.
const KanbanBoard = dynamic(
  () => import("@/components/missions/KanbanBoard").then((mod) => mod.KanbanBoard),
  { ssr: false },
);

type Props = {
  jobs: KanbanJob[];
  appliedAtByJobId?: Record<string, string>;
};

export function KanbanBoardLoader({ jobs, appliedAtByJobId }: Props) {
  // min-w-0 is load-bearing, not decorative — MissionsView's root is a flex
  // column, and a flex-column child defaults to min-width: auto (a classic
  // flexbox gotcha), which lets this board's own internal overflow-x-auto
  // row (KanbanBoard.tsx) stretch its parent to fit instead of scrolling
  // within it. Confirmed live at 375px: without this, the whole page
  // scrolled horizontally by over 1000px instead of just the board.
  return (
    <div className="min-w-0">
      <KanbanBoard jobs={jobs} appliedAtByJobId={appliedAtByJobId} />
    </div>
  );
}
