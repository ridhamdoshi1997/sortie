"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ListOrdered,
  Minus,
  Palette,
  Plus,
  Rows3,
  RotateCcw,
  Ruler,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Type,
} from "lucide-react";

import { RESUME_THEMES, SPACING_RANGES_V2, mapRange, upgradeSpacing } from "@/components/documents/ResumePDF";
import { buildDefaultStyle } from "@/lib/resumeSections";
import { RESUME_FONTS, RESUME_FONT_ORDER, fontKeyForThemeFamily } from "@/lib/resumeFonts";
import { TEMPLATE_META, TEMPLATE_ORDER, TEMPLATE_PRESETS, applyTemplate } from "@/lib/resumeTemplates";
import type { ResumeTheme } from "@/components/documents/ResumePDF";
import type { ResumeFontKey, ResumeStyle, ResumeTemplate } from "@/types/resumeEditor";

const THEME_LABELS: Record<ResumeTheme, string> = {
  modern: "Modern",
  classic: "Classic",
  minimal: "Minimal",
  slate: "Slate",
  editorial: "Editorial",
  sage: "Sage",
};

// Curated, recruiter-safe palette — a native OS color picker as the primary
// control reads cheap (per the research pass on how Enhancv/Novoresume
// handle this). These are résumé *content* colors, independent of the app's
// own --color-accent/--color-agent tokens, same as RESUME_THEMES' hardcoded
// hex in ResumePDF.tsx — not subject to the "no hardcoded hex" rule, which
// governs this app's own UI chrome, not user-authored document styling.
const ACCENT_SWATCHES: { label: string; value: string }[] = [
  { label: "Deep navy", value: "#1f3864" },
  { label: "Ink navy", value: "#1f2a44" },
  { label: "Amber", value: "#c9711f" },
  { label: "Navy", value: "#1f3a5f" },
  { label: "Charcoal", value: "#1a1a1a" },
  { label: "Forest", value: "#2f6b4f" },
  { label: "Burgundy", value: "#7a2e3a" },
  { label: "Slate blue", value: "#3d5a80" },
  { label: "Plum", value: "#5b3a6e" },
  { label: "Steel", value: "#4a5560" },
];

type FontPreset = "small" | "medium" | "large";

const FONT_SIZE_PRESETS: Record<FontPreset, { name: number; heading: number; subheading: number; body: number }> = {
  small: { name: 22, heading: 9.5, subheading: 8.5, body: 8.5 },
  medium: { name: 25, heading: 10.5, subheading: 9.5, body: 9.5 },
  large: { name: 28, heading: 11.5, subheading: 10.5, body: 10.5 },
};

function matchFontPreset(sizes: ResumeStyle["fontSizes"]): FontPreset | null {
  if (sizes.contact !== undefined || sizes.dates !== undefined) return null;
  const entry = (Object.entries(FONT_SIZE_PRESETS) as [FontPreset, (typeof FONT_SIZE_PRESETS)[FontPreset]][]).find(
    ([, preset]) =>
      preset.name === sizes.name &&
      preset.heading === sizes.heading &&
      preset.subheading === sizes.subheading &&
      preset.body === sizes.body,
  );
  return entry?.[0] ?? null;
}

// Each size a user can set, with the range it can move in (pt, 0.5 steps).
const SIZE_FIELDS: {
  key: keyof ResumeStyle["fontSizes"];
  label: string;
  min: number;
  max: number;
  resumeOnly?: boolean;
}[] = [
  { key: "name", label: "Name", min: 14, max: 32 },
  { key: "heading", label: "Section headings", min: 8, max: 16 },
  { key: "subheading", label: "Job titles & sub-headings", min: 8, max: 14, resumeOnly: true },
  { key: "body", label: "Body text", min: 7, max: 12 },
  { key: "contact", label: "Contact line", min: 7, max: 12 },
  { key: "dates", label: "Dates", min: 7, max: 12, resumeOnly: true },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </div>
  );
}

// Collapsible group — same button+chevron+conditional-render shape as
// EditorTab's own section accordion (SortableSectionRow), reused here by
// hand rather than factored into a shared primitive since this is still the
// only other place it's needed.
function Group({
  icon: Icon,
  title,
  defaultOpen,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 bg-surface-secondary px-4 py-3 text-left transition-colors hover:bg-surface-tertiary"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-text-primary">{title}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="flex flex-col gap-5 border-t border-border p-4">{children}</div>}
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  active,
  onSelect,
}: {
  options: { value: T; label: string }[];
  // Accepts null so a value that doesn't match any preset (i.e. "custom",
  // like typography sizes edited individually) can render with no option
  // highlighted, instead of forcing a misleading fake match.
  active: T | null;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-border p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
            o.value === active ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Same shape as Segmented, but each option renders an icon instead of text —
// alignment/columns should be *seen*, not read, per the research pass's
// "visual controls over raw inputs" pattern.
function IconSegmented<T extends string | number>({
  options,
  active,
  onSelect,
}: {
  options: { value: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
  active: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-border p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.label}
          aria-label={o.label}
          onClick={() => onSelect(o.value)}
          className={`flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors ${
            o.value === active ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-primary"
          }`}
        >
          <o.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

type DropdownPosition = { top: number; left: number; width: number };

// Custom listbox — replaces a native <select> for Theme/Page size/Font.
// User-caught live, in two stages: (1) a native <select>'s dropdown popup
// is OS/browser chrome, not styleable via CSS — Chrome renders every
// non-highlighted <option> in a muted grey regardless of this app's own
// dark theme, reading as broken. (2) the first fix (a plain absolutely-
// positioned panel) then rendered invisible — this control lives inside
// Group's `overflow-hidden` wrapper (needed for that accordion's own
// rounded corners), which silently clips anything that visually extends
// past it. Fixed by portaling the panel to document.body with `fixed`
// positioning computed from the trigger's real on-screen rect — the exact
// pattern (down to the comment explaining the same root cause) already
// established in ResumeManager.tsx's own row-action menu.
function Dropdown<T extends string>({
  value,
  options,
  onSelect,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onSelect: (v: T) => void;
}) {
  const [position, setPosition] = useState<DropdownPosition | null>(null);
  const activeLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          if (position) {
            setPosition(null);
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        }}
        aria-expanded={position !== null}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-transparent px-2 text-xs text-text-primary outline-none transition-colors hover:border-accent"
      >
        {activeLabel}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${position ? "rotate-180" : ""}`} />
      </button>
      {position && (
        <DropdownPanel
          position={position}
          options={options}
          value={value}
          onSelect={(v) => {
            onSelect(v);
            setPosition(null);
          }}
          onClose={() => setPosition(null)}
        />
      )}
    </>
  );
}

function DropdownPanel<T extends string>({
  position,
  options,
  value,
  onSelect,
  onClose,
}: {
  position: DropdownPosition;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // mousedown (not click) so this fires and closes BEFORE the trigger
  // button's own onClick re-evaluates — the button's toggle logic checks
  // "is a position already set," and since mousedown always precedes
  // click, this listener has already cleared it by the time the button's
  // handler runs, so re-clicking the trigger reopens fresh instead of
  // fighting this listener.
  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }
    // WCAG 2.1.1 keyboard-operability fix (accessibility audit, 2026-08-20)
    // — this panel previously had no keyboard way to close at all.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // The panel is `position: fixed` (viewport-relative), computed once from
  // the trigger's rect at open time — but the trigger sits inside
  // ResumeWorkspace's own scrollable side panel (`overflow-y-auto`). If
  // that scrolls while the panel is open, the trigger moves and the fixed
  // panel doesn't, so it visually detaches and "floats" disconnected from
  // it (user-caught live). `capture: true` on window catches scroll on
  // that nested container too — scroll events don't bubble, but capture-
  // phase dispatch reaches every ancestor listener regardless.
  useEffect(() => {
    window.addEventListener("scroll", onClose, true);
    return () => window.removeEventListener("scroll", onClose, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: position.top, left: position.left, minWidth: position.width }}
      className="animate-in fade-in-0 zoom-in-95 z-50 rounded-lg border border-border bg-surface p-1 shadow-card duration-150"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelect(o.value)}
          className={`flex w-full items-center justify-between gap-4 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
            o.value === value ? "bg-accent/15 text-accent" : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
          }`}
        >
          {o.label}
          {o.hint && <span className="text-[10px] font-normal text-text-muted">{o.hint}</span>}
        </button>
      ))}
    </div>,
    document.body,
  );
}

function ColumnsGlyph({ n }: { n: number }) {
  return (
    <span className="flex h-3.5 items-center justify-center gap-0.5">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="h-3.5 w-[3px] rounded-[1px] bg-current" />
      ))}
    </span>
  );
}
const TwoColumns = () => <ColumnsGlyph n={2} />;
const ThreeColumns = () => <ColumnsGlyph n={3} />;
const FourColumns = () => <ColumnsGlyph n={4} />;

// Live numeric readout next to each slider, using the same ranges ResumePDF
// applies at render time, so the number shown always matches the page.
function SpacingSlider({
  label,
  value,
  onChange,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span>{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-text-muted">{format(value)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
      />
    </div>
  );
}

// One font size, shown as a number in points and resizable three ways: the
// − / + buttons (0.5pt steps), typing an exact value, or dragging the slider.
// Direct user request (Phase 1): "font size numbering with the resizing".
function SizeControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  // A draft while typing, so "1" on the way to "10" isn't clamped mid-entry.
  const [draft, setDraft] = useState<string | null>(null);
  const settle = (v: number) => Math.min(max, Math.max(min, Math.round(v * 2) / 2));

  function commitDraft() {
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isFinite(n) && draft.trim() !== "") onChange(settle(n));
    setDraft(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-secondary">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(settle(value - 0.5))}
            disabled={value <= min}
            aria-label={`Decrease ${label} size`}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
          >
            <Minus className="h-3 w-3" />
          </button>
          <label className="flex h-6 items-center gap-0.5 rounded-md border border-border px-1.5 focus-within:border-accent">
            <input
              type="number"
              inputMode="decimal"
              step={0.5}
              min={min}
              max={max}
              value={draft ?? String(value)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitDraft();
              }}
              aria-label={`${label} size in points`}
              className="w-9 bg-transparent text-right font-mono text-[11px] tabular-nums text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="font-mono text-[10px] text-text-muted">pt</span>
          </label>
          <button
            type="button"
            onClick={() => onChange(settle(value + 0.5))}
            disabled={value >= max}
            aria-label={`Increase ${label} size`}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-text-muted transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.5}
        value={value}
        onChange={(e) => onChange(settle(Number(e.target.value)))}
        aria-label={`${label} size`}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-accent"
      />
    </div>
  );
}

// More structurally accurate than a generic bar-chart mockup: mirrors each
// template's real header alignment / sidebar ratio from ResumePDF.tsx, not
// just three interchangeable rectangles. Stops short of rendering the actual
// PDF to an image (a genuinely bigger lift — react-pdf has no cheap
// thumbnail path) — flagged as a follow-up, not silently skipped.
function TemplateThumbnail({ template }: { template: ResumeTemplate }) {
  if (template === "professional") {
    return (
      <span className="flex h-14 flex-col items-center gap-1 rounded bg-surface p-1.5">
        <span className="h-1 w-1/2 rounded-full bg-accent/70" />
        <span className="h-0.5 w-2/3 rounded-full bg-text-muted/40" />
        <span className="h-px w-full bg-accent/70" />
        <span className="mt-0.5 flex w-full gap-1">
          <span className="h-0.5 w-1/4 rounded-full bg-text-muted/60" />
          <span className="h-0.5 flex-1 rounded-full bg-border" />
        </span>
        <span className="flex w-full gap-1">
          <span className="h-0.5 w-1/5 rounded-full bg-text-muted/60" />
          <span className="h-0.5 flex-1 rounded-full bg-border" />
        </span>
        <span className="flex w-full justify-between">
          <span className="h-0.5 w-2/5 rounded-full bg-text-muted/50" />
          <span className="h-0.5 w-1/6 rounded-full bg-border" />
        </span>
      </span>
    );
  }

  if (template === "early_career") {
    return (
      <span className="flex h-14 flex-col items-center gap-1 rounded bg-surface p-1.5">
        <span className="h-1 w-1/2 rounded-full bg-accent/70" />
        <span className="h-0.5 w-3/5 rounded-full bg-border" />
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-0.5 w-3 rounded-full bg-accent/60" />
          ))}
        </span>
        <span className="mt-0.5 h-px w-full bg-accent/60" />
        <span className="grid w-full grid-cols-2 gap-x-1.5 gap-y-0.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-0.5 rounded-full bg-border" />
          ))}
        </span>
      </span>
    );
  }

  if (template === "split") {
    return (
      <span className="flex h-14 gap-1.5 rounded bg-surface p-1.5">
        <span className="flex w-[34%] flex-col gap-1 border-r border-border/70 pr-1">
          <span className="h-0.5 w-full rounded-full bg-accent/70" />
          <span className="h-0.5 w-4/5 rounded-full bg-border" />
          <span className="h-0.5 w-2/3 rounded-full bg-border" />
          <span className="mt-1 h-0.5 w-full rounded-full bg-accent/70" />
          <span className="h-0.5 w-3/4 rounded-full bg-border" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="h-1 w-2/3 rounded-full bg-text-muted/50" />
          <span className="h-0.5 w-1/2 rounded-full bg-border" />
          <span className="mt-1 h-0.5 w-1/3 rounded-full bg-accent/70" />
          <span className="h-0.5 w-full rounded-full bg-border" />
          <span className="h-0.5 w-5/6 rounded-full bg-border" />
        </span>
      </span>
    );
  }

  if (template === "timeline") {
    return (
      <span className="flex h-14 flex-col gap-1.5 rounded bg-surface p-1.5">
        <span className="h-1 w-1/2 rounded-full bg-text-muted/50" />
        <span className="mt-1 h-0.5 w-1/4 rounded-full bg-accent/70" />
        {[0, 1].map((i) => (
          <span key={i} className="flex gap-1.5">
            <span className="h-2.5 w-[18%] rounded-sm bg-border" />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="h-0.5 w-2/3 rounded-full bg-text-muted/40" />
              <span className="h-0.5 w-full rounded-full bg-border" />
            </span>
          </span>
        ))}
      </span>
    );
  }

  if (template === "executive") {
    return (
      <span className="flex h-14 flex-col gap-1 rounded bg-surface p-1.5">
        <span className="h-1.5 w-3/5 rounded-full bg-text-muted/50" />
        <span className="mt-0.5 flex flex-1 gap-1.5">
          <span className="flex flex-[65] flex-col gap-1">
            <span className="mt-0.5 h-0.5 w-1/3 rounded-full bg-accent/70" />
            <span className="h-0.5 w-full rounded-full bg-border" />
            <span className="h-0.5 w-5/6 rounded-full bg-border" />
          </span>
          <span className="flex flex-[35] flex-col gap-1 border-l border-border/70 pl-1.5">
            <span className="mt-0.5 h-0.5 w-full rounded-full bg-accent/70" />
            <span className="h-0.5 w-4/5 rounded-full bg-border" />
          </span>
        </span>
      </span>
    );
  }

  if (template === "block") {
    return (
      <span className="flex h-14 flex-col gap-1 rounded bg-surface p-1.5">
        <span className="flex h-4 flex-col items-center justify-center gap-0.5 rounded-sm bg-accent-dark/80">
          <span className="h-0.5 w-1/3 rounded-full bg-white/90" />
          <span className="h-0.5 w-1/4 rounded-full bg-white/60" />
        </span>
        <span className="mt-1 h-0.5 w-1/4 self-center rounded-full bg-accent/70" />
        <span className="h-0.5 w-full rounded-full bg-border" />
        <span className="h-0.5 w-5/6 self-center rounded-full bg-border" />
      </span>
    );
  }

  const centered = template === "centered";
  return (
    <span className={`flex h-14 flex-col gap-1 rounded bg-surface p-1.5 ${centered ? "items-center" : "items-start"}`}>
      <span className={`h-1 rounded-full bg-text-muted/50 ${centered ? "w-1/2" : "w-2/3"}`} />
      <span className={`h-0.5 rounded-full bg-border ${centered ? "w-1/3" : "w-2/5"}`} />
      <span className={`mt-1.5 h-0.5 rounded-full bg-accent/70 ${centered ? "w-1/4" : "w-1/3"}`} />
      <span className="h-0.5 w-full rounded-full bg-border" />
      <span className="h-0.5 w-5/6 rounded-full bg-border" />
      <span className={`mt-1 h-0.5 rounded-full bg-accent/70 ${centered ? "w-1/4" : "w-1/3"}`} />
      <span className="h-0.5 w-full rounded-full bg-border" />
    </span>
  );
}

type Props = {
  style: ResumeStyle;
  onChange: (next: ResumeStyle) => void;
  // Cover letters share this exact ResumeStyle object with the tailored
  // résumé (see CoverLetterPDF.tsx), but don't render a skills grid or a
  // bulleted list — those controls are meaningless there, per agy's
  // research pass on reusing this component across both documents.
  documentType?: "resume" | "cover_letter";
  /** Reorders the résumé's sections into a template's recommended order. Résumé workspaces only. */
  onApplySectionOrder?: (template: ResumeTemplate) => void;
};

export function StyleTab({ style, onChange, documentType = "resume", onApplySectionOrder }: Props) {
  // The template whose recommended section order is being offered, if any.
  const [orderOffer, setOrderOffer] = useState<ResumeTemplate | null>(null);
  const isResume = documentType === "resume";

  function set<K extends keyof ResumeStyle>(key: K, value: ResumeStyle[K]) {
    onChange({ ...style, [key]: value });
  }

  function pickTemplate(template: ResumeTemplate) {
    onChange(applyTemplate(style, template));
    setOrderOffer(isResume && onApplySectionOrder && TEMPLATE_PRESETS[template] ? template : null);
  }

  function setSpacing(key: keyof ResumeStyle["spacing"], value: number) {
    const base = upgradeSpacing(style);
    onChange({ ...base, spacing: { ...base.spacing, [key]: value } });
  }

  const activePreset = matchFontPreset(style.fontSizes);
  const activeFont: ResumeFontKey = style.fontFamily ?? fontKeyForThemeFamily(RESUME_THEMES[style.theme].fontFamily);
  const spacingV2 = upgradeSpacing(style).spacing;
  const offeredPreset = orderOffer ? TEMPLATE_PRESETS[orderOffer] : undefined;

  const sizeValue = (key: keyof ResumeStyle["fontSizes"]): number =>
    style.fontSizes[key] ?? (key === "contact" || key === "dates" ? style.fontSizes.body - 1 : 10);

  return (
    <div className="flex flex-col gap-3">
      <Group icon={Sparkles} title="Template & theme" defaultOpen>
        <Field label="Template">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TEMPLATE_ORDER.map((t) => {
              const meta = TEMPLATE_META[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  title={meta.description}
                  className={`flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                    style.template === t ? "border-accent bg-accent/15" : "border-border hover:border-accent"
                  }`}
                >
                  <TemplateThumbnail template={t} />
                  <span className="text-[11px] font-medium leading-tight text-text-secondary">{meta.label}</span>
                  <span
                    className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                      meta.ats === "safe" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    }`}
                  >
                    {meta.ats === "safe" ? <ShieldCheck className="h-2.5 w-2.5" /> : <TriangleAlert className="h-2.5 w-2.5" />}
                    {meta.ats === "safe" ? "ATS-safe" : "Higher risk"}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-5 text-text-muted">
            {TEMPLATE_META[style.template].description}
            {TEMPLATE_META[style.template].ats === "risky" &&
              " Two-column layouts are read out of order by some applicant tracking systems, notably Workday and Taleo — fine to hand to a person, riskier to upload."}
          </p>
        </Field>

        {orderOffer && offeredPreset && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-secondary p-3">
            <p className="flex items-start gap-1.5 text-xs text-text-primary">
              <ListOrdered className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              <span>
                {TEMPLATE_META[orderOffer].label} works best in this order: <span className="text-text-secondary">{offeredPreset.orderLabel}</span>
              </span>
            </p>
            {orderOffer === "early_career" && (
              <p className="text-[11px] text-text-muted">Tip: add a Key highlights section in the Editor tab for the strip under your name.</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onApplySectionOrder?.(orderOffer);
                  setOrderOffer(null);
                }}
                className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
              >
                Use this order
              </button>
              <button
                type="button"
                onClick={() => setOrderOffer(null)}
                className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface"
              >
                Keep my order
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Theme">
            <Dropdown
              value={style.theme}
              options={(Object.keys(THEME_LABELS) as ResumeTheme[]).map((t) => ({ value: t, label: THEME_LABELS[t] }))}
              // A theme brings its own colors, so a template palette gives way.
              onSelect={(v) => onChange({ ...style, theme: v, colors: null })}
            />
          </Field>
          <Field label="Page size">
            <Dropdown
              value={style.pageSize}
              options={[
                { value: "letter" as const, label: "Letter (8.5 × 11 in)" },
                { value: "a4" as const, label: "A4 (210 × 297 mm)" },
              ]}
              onSelect={(v) => set("pageSize", v)}
            />
          </Field>
        </div>
      </Group>

      <Group icon={Type} title="Font & sizes" defaultOpen>
        <Field label="Font">
          <Dropdown
            value={activeFont}
            options={RESUME_FONT_ORDER.map((key) => ({ value: key, label: RESUME_FONTS[key].label, hint: RESUME_FONTS[key].category }))}
            onSelect={(v) => set("fontFamily", v)}
          />
          <p className="text-[11px] text-text-muted">
            All six are ATS-safe. Word files use the font itself; PDFs use a free font with identical letter widths, so line breaks match.
          </p>
        </Field>

        <Field label="Quick size">
          <Segmented
            options={[
              { value: "small" as const, label: "Small" },
              { value: "medium" as const, label: "Medium" },
              { value: "large" as const, label: "Large" },
            ]}
            active={activePreset}
            onSelect={(v) => set("fontSizes", { ...FONT_SIZE_PRESETS[v] })}
          />
        </Field>

        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          {SIZE_FIELDS.filter((f) => isResume || !f.resumeOnly).map((f) => (
            <SizeControl
              key={f.key}
              label={f.label}
              value={sizeValue(f.key)}
              min={f.min}
              max={f.max}
              onChange={(v) => set("fontSizes", { ...style.fontSizes, [f.key]: v })}
            />
          ))}
        </div>

        <Field label="Name style">
          <Segmented
            options={[
              { value: "normal" as const, label: "Normal" },
              { value: "caps" as const, label: "CAPITALS" },
            ]}
            active={style.nameUppercase ? "caps" : "normal"}
            onSelect={(v) => set("nameUppercase", v === "caps")}
          />
        </Field>
      </Group>

      <Group icon={Palette} title="Colors">
        <Field label="Accent color">
          <div className="flex flex-wrap items-center gap-2">
            {ACCENT_SWATCHES.map((s) => (
              <button
                key={s.value}
                type="button"
                title={s.label}
                aria-label={s.label}
                onClick={() => set("accentColorOverride", s.value)}
                className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-surface transition-shadow ${
                  style.accentColorOverride?.toLowerCase() === s.value ? "ring-accent" : "ring-transparent hover:ring-border"
                }`}
                style={{ backgroundColor: s.value }}
              />
            ))}
            <label
              title="Custom color"
              className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-text-muted hover:border-accent hover:text-accent"
            >
              <Palette className="h-3.5 w-3.5" />
              <input
                type="color"
                value={style.accentColorOverride ?? style.colors?.accent ?? "#c9711f"}
                onChange={(e) => set("accentColorOverride", e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <button
              type="button"
              onClick={() => set("accentColorOverride", null)}
              className="text-[11px] text-text-muted hover:text-text-primary"
            >
              {style.colors ? "Use template colors" : "Use theme default"}
            </button>
          </div>
        </Field>
      </Group>

      <Group icon={Ruler} title="Layout & spacing">
        {/* "centered" and "block" always center the header — the alignment
            knob would be a no-op there, so it's hidden rather than
            shown-but-ignored (see ResumePDF.tsx's `alwaysCentered`). */}
        {style.template !== "centered" && style.template !== "block" && (
          <Field label="Header alignment">
            <IconSegmented
              options={[
                { value: "left" as const, label: "Left", icon: AlignLeft },
                { value: "center" as const, label: "Centre", icon: AlignCenter },
                { value: "right" as const, label: "Right", icon: AlignRight },
              ]}
              active={style.headerAlignment}
              onSelect={(v) => set("headerAlignment", v)}
            />
          </Field>
        )}

        {isResume && (
          <>
            <Field label="Skills layout">
              <Segmented
                options={[
                  { value: "theme" as const, label: "Theme" },
                  { value: "chips" as const, label: "Chips" },
                  { value: "grid" as const, label: "Grid" },
                  { value: "bulleted" as const, label: "Bullets" },
                  { value: "grouped" as const, label: "Grouped" },
                ]}
                active={style.skillsDisplay ?? "theme"}
                onSelect={(v) => set("skillsDisplay", v)}
              />
              {style.skillsDisplay === "grouped" && (
                <p className="text-[11px] text-text-muted">Add skill groups in the Editor tab — each prints as a labeled line.</p>
              )}
            </Field>

            <Field label="Skills columns">
              <IconSegmented
                options={[
                  { value: 2, label: "2 columns", icon: TwoColumns },
                  { value: 3, label: "3 columns", icon: ThreeColumns },
                  { value: 4, label: "4 columns", icon: FourColumns },
                ]}
                active={style.skillsColumns}
                onSelect={(v) => set("skillsColumns", v)}
              />
            </Field>

            <Field label="Job header">
              <Segmented
                options={[
                  { value: "title_first" as const, label: "Job title first" },
                  { value: "company_first" as const, label: "Company first" },
                ]}
                active={style.entryHeader ?? "title_first"}
                onSelect={(v) => set("entryHeader", v)}
              />
            </Field>

            <Field label="Certifications">
              <Segmented
                options={[
                  { value: "stacked" as const, label: "List" },
                  { value: "inline" as const, label: "One line" },
                ]}
                active={style.certificationsDisplay ?? "stacked"}
                onSelect={(v) => set("certificationsDisplay", v)}
              />
            </Field>

            <Field label="Bullet style">
              <Segmented
                options={[
                  { value: "•", label: "•" },
                  { value: "—", label: "—" },
                  { value: "▪", label: "▪" },
                ]}
                active={style.bulletStyle}
                onSelect={(v) => set("bulletStyle", v)}
              />
            </Field>
          </>
        )}

        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            <Rows3 className="h-3 w-3" />
            Spacing
          </span>
          <SpacingSlider
            label="Section spacing"
            value={spacingV2.section}
            onChange={(v) => setSpacing("section", v)}
            format={(v) => `${mapRange(v, ...SPACING_RANGES_V2.section).toFixed(1)}pt`}
          />
          <SpacingSlider
            label="Entry spacing"
            value={spacingV2.entry}
            onChange={(v) => setSpacing("entry", v)}
            format={(v) => `${mapRange(v, ...SPACING_RANGES_V2.entry).toFixed(1)}pt`}
          />
          <SpacingSlider
            label="Line spacing"
            value={spacingV2.line}
            onChange={(v) => setSpacing("line", v)}
            format={(v) => `${mapRange(v, ...SPACING_RANGES_V2.line).toFixed(2)}×`}
          />
          <SpacingSlider
            label="Page margins"
            value={spacingV2.margins}
            onChange={(v) => setSpacing("margins", v)}
            format={(v) => {
              const pt = mapRange(v, ...SPACING_RANGES_V2.margins);
              return `${pt.toFixed(0)}pt · ${(pt / 72).toFixed(2)}″`;
            }}
          />
        </div>
      </Group>

      <button
        type="button"
        onClick={() => {
          const base = buildDefaultStyle(style.theme, style.template);
          onChange(TEMPLATE_PRESETS[style.template] ? applyTemplate(base, style.template) : base);
        }}
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset formatting
      </button>
    </div>
  );
}
