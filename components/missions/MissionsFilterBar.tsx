"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowUpDown, ChevronDown, MapPin, Puzzle, Search, Target, X } from "lucide-react";

// Mirrors components/find-jobs/FilterBar.tsx's FilterPopover/FilterPanel/
// RadioOption pattern (portal + position:fixed trigger popover) — kept as
// its own small copy rather than a shared import, since Missions' filters
// are plain client-side array filtering over jobs already loaded into the
// page (no server round trip, no SearchFilters query-param shape), a
// different enough data model from Find & Evaluate's server-driven search
// that sharing the component would need its own generic layer for no real
// gain yet. Colors adapted to this page's own plain-surface tokens
// (border-border/bg-surface, matching MissionsView's existing Board/List
// toggle) rather than FilterBar's overlay-tinted hero colors.

type PanelPosition = { top: number; left: number; minWidth: number };

function FilterPopover({
  label,
  icon,
  isActive,
  activeLabel,
  onClear,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  activeLabel?: string;
  onClear?: () => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const open = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.bottom + 6, left: rect.left, minWidth: rect.width });
  };
  const close = () => setPosition(null);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (position ? close() : open())}
        aria-expanded={position !== null}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors ${
          isActive
            ? "border-accent bg-accent-muted text-accent"
            : "border-border bg-surface text-text-secondary hover:bg-surface-secondary"
        }`}
      >
        {icon}
        {isActive ? activeLabel ?? label : label}
        {isActive && onClear ? (
          <X
            className="h-3.5 w-3.5 shrink-0 opacity-70 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          />
        ) : (
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${position ? "rotate-180" : ""}`} />
        )}
      </button>
      {position && (
        <FilterPanel position={position} onClose={close}>
          {children(close)}
        </FilterPanel>
      )}
    </div>
  );
}

function FilterPanel({
  position,
  onClose,
  children,
}: {
  position: PanelPosition;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose]);

  // Closes when the PAGE scrolls out from under this fixed-position panel —
  // but capture-phase `window` scroll listeners also receive scroll events
  // from any DESCENDANT scrollable element (scroll doesn't bubble, but it
  // still traverses the capture phase top-down first), including this
  // panel's own `overflow-y-auto` location list below. Without the
  // containment check, scrolling the list itself read as "the page
  // scrolled" and closed the panel on the very first scroll tick — a real
  // bug caught live (this is the first FilterPanel-shaped popover in the
  // codebase to actually need internal scrolling; FilterBar.tsx's own
  // copy of this pattern never hit it since none of its panels overflow).
  useEffect(() => {
    function onScroll(event: Event) {
      // event.target isn't always a Node (e.g. can be `window` itself for
      // some scroll dispatches) — Node.contains() throws on a non-Node
      // argument rather than returning false, so this has to be guarded.
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      onClose();
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: position.top, left: position.left, minWidth: position.minWidth }}
      className="animate-in fade-in-0 zoom-in-95 z-50 max-h-72 max-w-xs overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-card duration-150"
    >
      {children}
    </div>,
    document.body,
  );
}

function RadioOption({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
        checked ? "bg-accent-muted text-accent" : "text-text-secondary hover:bg-surface-secondary"
      }`}
    >
      <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${checked ? "border-accent bg-accent" : "border-border"}`} />
      {label}
    </button>
  );
}

export type SortValue = "found" | "match" | "stage";

const MATCH_SCORE_OPTIONS = [50, 70, 85];

const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: "found", label: "Recently found" },
  { value: "match", label: "Highest match score" },
  { value: "stage", label: "Longest gone quiet" },
];

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  location: string;
  onLocationChange: (value: string) => void;
  locations: string[];
  remoteOnly: boolean;
  onRemoteOnlyChange: (value: boolean) => void;
  minMatchScore: number | null;
  onMinMatchScoreChange: (value: number | null) => void;
  needsAttentionOnly: boolean;
  onNeedsAttentionOnlyChange: (value: boolean) => void;
  sortBy: SortValue;
  onSortByChange: (value: SortValue) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  availableSources: { value: string; label: string }[];
};

export function MissionsFilterBar({
  search,
  onSearchChange,
  location,
  onLocationChange,
  locations,
  remoteOnly,
  onRemoteOnlyChange,
  minMatchScore,
  onMinMatchScoreChange,
  needsAttentionOnly,
  onNeedsAttentionOnlyChange,
  sortBy,
  onSortByChange,
  sourceFilter,
  onSourceFilterChange,
  availableSources,
}: Props) {
  const hasActive =
    search.trim() !== "" ||
    location !== "" ||
    remoteOnly ||
    minMatchScore !== null ||
    needsAttentionOnly ||
    sourceFilter !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title or company"
          className="h-9 w-56 rounded-full border border-border bg-surface pl-8 pr-3 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
        />
      </div>

      {locations.length > 0 && (
        <FilterPopover
          label="Location"
          icon={<MapPin className="h-3.5 w-3.5 shrink-0" />}
          isActive={location !== ""}
          activeLabel={location}
          onClear={() => onLocationChange("")}
        >
          {(close) => (
            <div className="flex flex-col gap-0.5">
              <RadioOption
                label="All locations"
                checked={location === ""}
                onSelect={() => {
                  onLocationChange("");
                  close();
                }}
              />
              {locations.map((loc) => (
                <RadioOption
                  key={loc}
                  label={loc}
                  checked={location === loc}
                  onSelect={() => {
                    onLocationChange(loc);
                    close();
                  }}
                />
              ))}
            </div>
          )}
        </FilterPopover>
      )}

      {availableSources.length > 0 && (
        <FilterPopover
          label="Source"
          icon={<Puzzle className="h-3.5 w-3.5 shrink-0" />}
          isActive={sourceFilter !== ""}
          activeLabel={availableSources.find((s) => s.value === sourceFilter)?.label}
          onClear={() => onSourceFilterChange("")}
        >
          {(close) => (
            <div className="flex flex-col gap-0.5">
              <RadioOption
                label="All sources"
                checked={sourceFilter === ""}
                onSelect={() => {
                  onSourceFilterChange("");
                  close();
                }}
              />
              {availableSources.map((option) => (
                <RadioOption
                  key={option.value}
                  label={option.label}
                  checked={sourceFilter === option.value}
                  onSelect={() => {
                    onSourceFilterChange(option.value);
                    close();
                  }}
                />
              ))}
            </div>
          )}
        </FilterPopover>
      )}

      <button
        type="button"
        onClick={() => onRemoteOnlyChange(!remoteOnly)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors ${
          remoteOnly
            ? "border-accent bg-accent-muted text-accent"
            : "border-border bg-surface text-text-secondary hover:bg-surface-secondary"
        }`}
      >
        Remote only
      </button>

      <FilterPopover
        label="Min match score"
        icon={<Target className="h-3.5 w-3.5 shrink-0" />}
        isActive={minMatchScore !== null}
        activeLabel={minMatchScore !== null ? `${minMatchScore}+ match` : undefined}
        onClear={() => onMinMatchScoreChange(null)}
      >
        {(close) => (
          <div className="flex flex-col gap-0.5">
            {MATCH_SCORE_OPTIONS.map((value) => (
              <RadioOption
                key={value}
                label={`${value}+ match score`}
                checked={minMatchScore === value}
                onSelect={() => {
                  onMinMatchScoreChange(value);
                  close();
                }}
              />
            ))}
          </div>
        )}
      </FilterPopover>

      <button
        type="button"
        onClick={() => onNeedsAttentionOnlyChange(!needsAttentionOnly)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors ${
          needsAttentionOnly
            ? "border-warning bg-warning/15 text-warning"
            : "border-border bg-surface text-text-secondary hover:bg-surface-secondary"
        }`}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Needs attention
      </button>

      <FilterPopover
        label="Sort"
        icon={<ArrowUpDown className="h-3.5 w-3.5 shrink-0" />}
        isActive={sortBy !== "found"}
        activeLabel={SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
        onClear={() => onSortByChange("found")}
      >
        {(close) => (
          <div className="flex flex-col gap-0.5">
            {SORT_OPTIONS.map((option) => (
              <RadioOption
                key={option.value}
                label={option.label}
                checked={sortBy === option.value}
                onSelect={() => {
                  onSortByChange(option.value);
                  close();
                }}
              />
            ))}
          </div>
        )}
      </FilterPopover>

      {hasActive && (
        <button
          type="button"
          onClick={() => {
            onSearchChange("");
            onLocationChange("");
            onRemoteOnlyChange(false);
            onMinMatchScoreChange(null);
            onNeedsAttentionOnlyChange(false);
            onSourceFilterChange("");
          }}
          className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}
