import type { LucideIcon } from "lucide-react";

// Job-detail redesign (2026-08-25) — icon-chip + title section header,
// matching this app's own established pattern (StarVault.tsx,
// MarketReadiness.tsx, OutcomeInsights.tsx on /career). Neutral, not the
// agent-teal `.signal-icon-chip` those career cards use — that teal is
// reserved for AI-backed tool cards, and a section header here is pure
// structure, not AI content.
export function SectionHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-text-secondary">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="font-display text-lg font-semibold text-text-primary">{label}</h2>
    </div>
  );
}
