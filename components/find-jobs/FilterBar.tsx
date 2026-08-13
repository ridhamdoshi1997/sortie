"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import type {
  DatePosted,
  ExperienceLevel,
  JobType,
  RemotePolicy,
  SearchFilters,
} from "@/lib/jobFilters";
import { countActiveFilters, DEFAULT_FILTERS } from "@/lib/jobFilters";

// Top filter bar for Find & Evaluate, replacing the old two loose free-text
// boxes (Phase 11, researched via agy against LinkedIn/Indeed/Wellfound/
// Otta/JobRight/Teal/Glassdoor/ZipRecruiter). Pattern: a row of dropdown
// triggers below the search inputs; an applied filter turns its own trigger
// into a highlighted pill with an inline "x" to clear — the industry-
// standard shape agy's research converged on, not a persistent sidebar.
//
// 5 primary filters sit directly in the bar (the ones every competitor has,
// or that are core to Sortie specifically); Min Match Score, Visa
// Sponsorship, Hide Keyword, and Company sit behind a trailing "More
// filters" popover — same primary-bar/secondary-drawer split agy's research
// described, without building a full off-canvas drawer for 4 extra controls.

type Props = {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
};

type PanelPosition = { top: number; left: number; minWidth: number };

function FilterPopover({
  label,
  isActive,
  activeLabel,
  onClear,
  children,
}: {
  label: string;
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
            : "border-overlay-foreground/15 bg-overlay-foreground/8 text-overlay-foreground/80 hover:border-overlay-foreground/30"
        }`}
      >
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

// Same proven portal + position:fixed pattern as StyleTab.tsx's
// Dropdown/DropdownPanel (see ui-registry.md) — a plain `absolute` popup
// gets silently clipped by any ancestor `overflow-hidden`, and this bar
// sits inside a glass panel that has exactly that.
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

  useEffect(() => {
    window.addEventListener("scroll", onClose, true);
    return () => window.removeEventListener("scroll", onClose, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: position.top, left: position.left, minWidth: position.minWidth }}
      className="animate-in fade-in-0 zoom-in-95 z-50 max-w-xs rounded-xl border border-border bg-surface p-3 shadow-card duration-150"
    >
      {children}
    </div>,
    document.body
  );
}

function RadioOption({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
        checked ? "bg-accent-muted text-accent" : "text-text-secondary hover:bg-surface-secondary"
      }`}
    >
      <span
        className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
          checked ? "border-accent bg-accent" : "border-border"
        }`}
      />
      {label}
    </button>
  );
}

function CheckboxOption({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
        checked ? "bg-accent-muted text-accent" : "text-text-secondary hover:bg-surface-secondary"
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border-2 ${
          checked ? "border-accent bg-accent text-accent-foreground" : "border-border"
        }`}
      >
        {checked && <span className="text-[9px] leading-none">✓</span>}
      </span>
      {label}
    </button>
  );
}

const DATE_POSTED_OPTIONS: { value: DatePosted; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Past 24 hours" },
  { value: "3days", label: "Past 3 days" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
];

const REMOTE_OPTIONS: { value: RemotePolicy; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

const JOB_TYPE_OPTIONS: JobType[] = ["Full-time", "Part-time", "Contract", "Internship"];

const EXPERIENCE_OPTIONS: ExperienceLevel[] = ["Entry-level", "Mid-level", "Senior", "Lead", "Executive"];

const SALARY_OPTIONS = [50000, 80000, 100000, 150000, 200000];

const MATCH_SCORE_OPTIONS = [50, 70, 85];

function toggleInArray<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FilterBar({ filters, onChange }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const [morePosition, setMorePosition] = useState<PanelPosition | null>(null);

  const secondaryActiveCount =
    (filters.minMatchScore !== null ? 1 : 0) +
    (filters.visaSponsorshipOnly ? 1 : 0) +
    (filters.hideKeyword.trim() ? 1 : 0) +
    (filters.company.trim() ? 1 : 0);

  const activeTotal = countActiveFilters(filters);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterPopover
        label="Date posted"
        isActive={filters.datePosted !== "any"}
        activeLabel={DATE_POSTED_OPTIONS.find((o) => o.value === filters.datePosted)?.label}
        onClear={() => onChange({ ...filters, datePosted: "any" })}
      >
        {(close) => (
          <div className="flex flex-col gap-0.5">
            {DATE_POSTED_OPTIONS.map((option) => (
              <RadioOption
                key={option.value}
                label={option.label}
                checked={filters.datePosted === option.value}
                onSelect={() => {
                  onChange({ ...filters, datePosted: option.value });
                  close();
                }}
              />
            ))}
          </div>
        )}
      </FilterPopover>

      <FilterPopover
        label="Remote policy"
        isActive={filters.remotePolicy.length > 0}
        activeLabel={`Remote policy (${filters.remotePolicy.length})`}
        onClear={() => onChange({ ...filters, remotePolicy: [] })}
      >
        {() => (
          <div className="flex flex-col gap-0.5">
            {REMOTE_OPTIONS.map((option) => (
              <CheckboxOption
                key={option.value}
                label={option.label}
                checked={filters.remotePolicy.includes(option.value)}
                onToggle={() =>
                  onChange({ ...filters, remotePolicy: toggleInArray(filters.remotePolicy, option.value) })
                }
              />
            ))}
          </div>
        )}
      </FilterPopover>

      <FilterPopover
        label="Job type"
        isActive={filters.jobType.length > 0}
        activeLabel={`Job type (${filters.jobType.length})`}
        onClear={() => onChange({ ...filters, jobType: [] })}
      >
        {() => (
          <div className="flex flex-col gap-0.5">
            {JOB_TYPE_OPTIONS.map((option) => (
              <CheckboxOption
                key={option}
                label={option}
                checked={filters.jobType.includes(option)}
                onToggle={() => onChange({ ...filters, jobType: toggleInArray(filters.jobType, option) })}
              />
            ))}
          </div>
        )}
      </FilterPopover>

      <FilterPopover
        label="Min salary"
        isActive={filters.salaryMin !== null}
        activeLabel={filters.salaryMin ? `$${filters.salaryMin / 1000}k+` : undefined}
        onClear={() => onChange({ ...filters, salaryMin: null })}
      >
        {(close) => (
          <div className="flex flex-col gap-0.5">
            {SALARY_OPTIONS.map((value) => (
              <RadioOption
                key={value}
                label={`$${value / 1000}k+`}
                checked={filters.salaryMin === value}
                onSelect={() => {
                  onChange({ ...filters, salaryMin: value });
                  close();
                }}
              />
            ))}
          </div>
        )}
      </FilterPopover>

      <FilterPopover
        label="Experience"
        isActive={filters.experienceLevel.length > 0}
        activeLabel={`Experience (${filters.experienceLevel.length})`}
        onClear={() => onChange({ ...filters, experienceLevel: [] })}
      >
        {() => (
          <div className="flex flex-col gap-0.5">
            {EXPERIENCE_OPTIONS.map((option) => (
              <CheckboxOption
                key={option}
                label={option}
                checked={filters.experienceLevel.includes(option)}
                onToggle={() =>
                  onChange({ ...filters, experienceLevel: toggleInArray(filters.experienceLevel, option) })
                }
              />
            ))}
          </div>
        )}
      </FilterPopover>

      <div className="relative">
        <button
          ref={moreTriggerRef}
          type="button"
          onClick={() => {
            if (moreOpen) {
              setMoreOpen(false);
              return;
            }
            const rect = moreTriggerRef.current?.getBoundingClientRect();
            if (rect) setMorePosition({ top: rect.bottom + 6, left: rect.left, minWidth: 220 });
            setMoreOpen(true);
          }}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors ${
            secondaryActiveCount > 0
              ? "border-accent bg-accent-muted text-accent"
              : "border-overlay-foreground/15 bg-overlay-foreground/8 text-overlay-foreground/80 hover:border-overlay-foreground/30"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          More filters
          {secondaryActiveCount > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] leading-none text-accent-foreground">
              {secondaryActiveCount}
            </span>
          )}
        </button>
        {moreOpen && morePosition && (
          <FilterPanel position={morePosition} onClose={() => setMoreOpen(false)}>
            <div className="flex w-64 flex-col gap-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-text-secondary">Minimum match score</p>
                <div className="flex gap-1.5">
                  {MATCH_SCORE_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...filters,
                          minMatchScore: filters.minMatchScore === value ? null : value,
                        })
                      }
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        filters.minMatchScore === value
                          ? "border-accent bg-accent-muted text-accent"
                          : "border-border text-text-secondary hover:bg-surface-secondary"
                      }`}
                    >
                      {value}+
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 text-sm text-text-secondary">
                Visa sponsorship only
                <button
                  type="button"
                  role="switch"
                  aria-checked={filters.visaSponsorshipOnly}
                  onClick={() => onChange({ ...filters, visaSponsorshipOnly: !filters.visaSponsorshipOnly })}
                  className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
                    filters.visaSponsorshipOnly ? "border-accent bg-accent" : "border-border bg-surface-secondary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-surface shadow-card ring-1 ring-border/50 transition-transform duration-200 ${
                      filters.visaSponsorshipOnly ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-text-secondary">Hide postings mentioning</p>
                <input
                  value={filters.hideKeyword}
                  onChange={(e) => onChange({ ...filters, hideKeyword: e.target.value })}
                  placeholder="e.g. staffing agency"
                  className="w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-text-secondary">Company</p>
                <input
                  value={filters.company}
                  onChange={(e) => onChange({ ...filters, company: e.target.value })}
                  placeholder="e.g. Shopify"
                  className="w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                />
              </div>
            </div>
          </FilterPanel>
        )}
      </div>

      {activeTotal > 0 && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-medium text-overlay-foreground/60 transition-colors hover:text-overlay-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Clear all
        </button>
      )}
    </div>
  );
}
