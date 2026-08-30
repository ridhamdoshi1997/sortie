"use client";

import { useEffect, useState, useTransition } from "react";
import { SlidersHorizontal, Eye, EyeOff } from "lucide-react";

import { SectionModal } from "@/components/profile/SectionModal";
import { setDashboardHiddenWidgets } from "@/actions/dashboardLayout";
import { DASHBOARD_WIDGET_KEYS, type DashboardWidgetKey } from "@/lib/dashboardWidgets";

const WIDGET_LABELS: Record<DashboardWidgetKey, string> = {
  weeklyBriefing: "Weekly AI briefing",
  aiActionCenter: "AI Action Center",
  pipelineFunnel: "Pipeline Funnel",
  pipelineStrategy: "Pipeline Strategy Read",
  matchDistribution: "Match Quality Histogram",
  activityHeatmap: "Activity Heatmap",
  upcomingInterviews: "Upcoming Interviews",
  recentActivity: "Recent Activity",
  rejectionRadar: "Rejection Radar",
  careerRadar: "Career Radar",
};

type Props = {
  initialHidden: DashboardWidgetKey[];
};

// Show/hide only, deliberately no reorder — build-plan.md §P's bento-grid
// layout (which widget spans how many columns, next to which other one) was
// its own researched design decision. Letting a user hide a widget is a
// clean, bounded feature; letting them drag it anywhere would mean either
// reinventing that grid's span logic per arbitrary order or silently
// flattening it to a plain list — the app/dashboard/page.tsx server
// component recomputes each row's effective column split from whichever
// widgets in it are still visible, so hiding one never leaves dead space.
export function CustomizeDashboardModal({ initialHidden }: Props) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<DashboardWidgetKey>>(new Set(initialHidden));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function toggle(key: DashboardWidgetKey): void {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSave(): void {
    setError(null);
    startSaving(async () => {
      const result = await setDashboardHiddenWidgets(Array.from(hidden));
      if (!result.success) {
        setError(result.error ?? "Failed to save");
        return;
      }
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 w-fit items-center gap-2 self-end rounded-lg border border-border px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Customize
      </button>

      {open && (
        <SectionModal title="Customize dashboard" onClose={() => setOpen(false)} onSave={handleSave} saving={isSaving}>
          <p className="mb-4 text-sm text-text-secondary">
            Hide widgets you don&apos;t use. Position stays fixed — the remaining widgets reflow to fill the space.
          </p>
          <div className="flex flex-col gap-2">
            {DASHBOARD_WIDGET_KEYS.map((key) => {
              const isHidden = hidden.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-4 py-3 text-left transition-colors hover:bg-surface"
                >
                  <span className={`text-sm font-medium ${isHidden ? "text-text-muted" : "text-text-primary"}`}>
                    {WIDGET_LABELS[key]}
                  </span>
                  {isHidden ? (
                    <EyeOff className="h-4 w-4 shrink-0 text-text-muted" />
                  ) : (
                    <Eye className="h-4 w-4 shrink-0 text-accent" />
                  )}
                </button>
              );
            })}
          </div>
          {error && <p className="mt-3 text-sm text-error">{error}</p>}
        </SectionModal>
      )}
    </>
  );
}
