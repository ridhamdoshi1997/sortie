"use client";

import { useEffect, useState } from "react";

import { getUsageStats } from "@/actions/usageStats";
import type { UsageAction } from "@/lib/usage";

// Visible credit/usage consumption in-editor (build-plan.md §C) — reuses
// Settings -> Credits & Usage's exact same server action rather than a
// second usage-reading code path. Deliberately scoped to just the one
// action a given editor actually spends (document_generation for
// résumé/cover-letter regeneration, bullet_rewrite for the AI Rewrite
// tab's per-bullet rewrites) instead of the full multi-row Settings view —
// this is a small in-context reminder, not a dashboard.
export function EditorUsageMeter({ action }: { action: UsageAction }) {
  const [state, setState] = useState<{ count: number; limit: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUsageStats().then((result) => {
      if (cancelled || !result.success) return;
      const row = result.rows.find((r) => r.action === action);
      setState(row ? { count: row.count, limit: row.limit } : { count: 0, limit: 0 });
    });
    return () => {
      cancelled = true;
    };
  }, [action]);

  if (!state || state.limit === 0) return null;

  const remaining = Math.max(0, state.limit - state.count);
  const isLow = remaining <= 1;

  return (
    <span
      className={`font-mono text-[11px] ${isLow ? "text-warning" : "text-text-muted"}`}
      title={`${state.count} of ${state.limit} used today`}
    >
      {remaining} of {state.limit} left today
    </span>
  );
}
