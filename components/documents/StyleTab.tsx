"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Palette,
  Rows3,
  RotateCcw,
  Ruler,
  Sparkles,
} from "lucide-react";

import { mapRange, SPACING_RANGES } from "@/components/documents/ResumePDF";
import { buildDefaultStyle } from "@/lib/resumeSections";
import type { ResumeTheme } from "@/components/documents/ResumePDF";
import type { ResumeStyle, ResumeTemplate } from "@/types/resumeEditor";

const TEMPLATE_LABELS: Record<ResumeTemplate, string> = {
  structured: "Structured",
  centered: "Centered",
  split: "Split",
  timeline: "Timeline",
  executive: "Executive",
  block: "Block",
};

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

const FONT_SIZE_PRESETS: Record<FontPreset, ResumeStyle["fontSizes"]> = {
  small: { name: 22, heading: 9.5, subheading: 8.5, body: 8.5 },
  medium: { name: 25, heading: 10.5, subheading: 9.5, body: 9.5 },
  large: { name: 28, heading: 11.5, subheading: 10.5, body: 10.5 },
};

function matchFontPreset(sizes: ResumeStyle["fontSizes"]): FontPreset | null {
  const entry = (Object.entries(FONT_SIZE_PRESETS) as [FontPreset, ResumeStyle["fontSizes"]][]).find(
    ([, preset]) =>
      preset.name === sizes.name &&
      preset.heading === sizes.heading &&
      preset.subheading === sizes.subheading &&
      preset.body === sizes.body,
  );
  return entry?.[0] ?? null;
}

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
  // like typography sizes edited via the Advanced inputs) can render with no
  // option highlighted, instead of forcing a misleading fake match.
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
          className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
            o.value === active ? "bg-accent-muted text-accent" : "text-text-muted hover:text-text-primary"
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
            o.value === active ? "bg-accent-muted text-accent" : "text-text-muted hover:text-text-primary"
          }`}
        >
          <o.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

type DropdownPosition = { top: number; left: number; width: number };

// Custom listbox — replaces a native <select> for Theme/Page size.
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
  options: { value: T; label: string }[];
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
  options: { value: T; label: string }[];
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
          className={`block w-full whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
            o.value === value ? "bg-accent-muted text-accent" : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
          }`}
        >
          {o.label}
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

// Live numeric readout next to each slider — before this the raw 0-100
// values were shown with no unit at all, so dragging was blind. Uses the
// exact same mapRange/SPACING_RANGES ResumePDF applies at render time so the
// number shown here always matches what actually lands on the page.
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
  // bulleted list — those two controls are meaningless there, per agy's
  // research pass on reusing this component across both documents.
  documentType?: "resume" | "cover_letter";
};

export function StyleTab({ style, onChange, documentType = "resume" }: Props) {
  const [showAdvancedType, setShowAdvancedType] = useState(false);

  function set<K extends keyof ResumeStyle>(key: K, value: ResumeStyle[K]) {
    onChange({ ...style, [key]: value });
  }

  const activePreset = matchFontPreset(style.fontSizes);

  return (
    <div className="flex flex-col gap-3">
      <Group icon={Sparkles} title="Template & theme" defaultOpen>
        <Field label="Template">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(TEMPLATE_LABELS) as ResumeTemplate[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("template", t)}
                className={`flex flex-col gap-2 rounded-lg border p-2 transition-colors ${
                  style.template === t ? "border-accent bg-accent-muted" : "border-border hover:border-accent"
                }`}
              >
                <TemplateThumbnail template={t} />
                <span className="text-[10px] font-medium text-text-secondary">{TEMPLATE_LABELS[t]}</span>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Theme">
            <Dropdown
              value={style.theme}
              options={(Object.keys(THEME_LABELS) as ResumeTheme[]).map((t) => ({ value: t, label: THEME_LABELS[t] }))}
              onSelect={(v) => set("theme", v)}
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

      <Group icon={Palette} title="Typography & colors">
        <Field label="Text size">
          <Segmented
            options={[
              { value: "small" as const, label: "S" },
              { value: "medium" as const, label: "M" },
              { value: "large" as const, label: "L" },
            ]}
            active={activePreset}
            onSelect={(v) => set("fontSizes", FONT_SIZE_PRESETS[v])}
          />
          <button
            type="button"
            onClick={() => setShowAdvancedType((v) => !v)}
            className="mt-1 self-start text-[11px] font-medium text-text-muted hover:text-accent"
          >
            {showAdvancedType ? "Hide" : activePreset ? "Advanced" : "Edit exact sizes"}
          </button>
          {showAdvancedType && (
            <div className="mt-1 grid grid-cols-4 gap-2">
              <Field label="Name">
                <input
                  type="number"
                  value={style.fontSizes.name}
                  onChange={(e) => set("fontSizes", { ...style.fontSizes, name: Number(e.target.value) })}
                  className="h-9 w-full rounded-lg border border-border bg-transparent px-2 text-center font-mono text-xs text-text-primary outline-none"
                />
              </Field>
              <Field label="Headings">
                <input
                  type="number"
                  value={style.fontSizes.heading}
                  onChange={(e) => set("fontSizes", { ...style.fontSizes, heading: Number(e.target.value) })}
                  className="h-9 w-full rounded-lg border border-border bg-transparent px-2 text-center font-mono text-xs text-text-primary outline-none"
                />
              </Field>
              <Field label="Sub-heads">
                <input
                  type="number"
                  value={style.fontSizes.subheading}
                  onChange={(e) => set("fontSizes", { ...style.fontSizes, subheading: Number(e.target.value) })}
                  className="h-9 w-full rounded-lg border border-border bg-transparent px-2 text-center font-mono text-xs text-text-primary outline-none"
                />
              </Field>
              <Field label="Body">
                <input
                  type="number"
                  value={style.fontSizes.body}
                  onChange={(e) => set("fontSizes", { ...style.fontSizes, body: Number(e.target.value) })}
                  className="h-9 w-full rounded-lg border border-border bg-transparent px-2 text-center font-mono text-xs text-text-primary outline-none"
                />
              </Field>
            </div>
          )}
        </Field>

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
                value={style.accentColorOverride ?? "#c9711f"}
                onChange={(e) => set("accentColorOverride", e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <button
              type="button"
              onClick={() => set("accentColorOverride", null)}
              className="text-[11px] text-text-muted hover:text-text-primary"
            >
              Use theme default
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

        {documentType === "resume" && (
          <>
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
            value={style.spacing.section}
            onChange={(v) => set("spacing", { ...style.spacing, section: v })}
            format={(v) => `${mapRange(v, ...SPACING_RANGES.section).toFixed(0)}pt`}
          />
          <SpacingSlider
            label="Entry spacing"
            value={style.spacing.entry}
            onChange={(v) => set("spacing", { ...style.spacing, entry: v })}
            format={(v) => `${mapRange(v, ...SPACING_RANGES.entry).toFixed(0)}pt`}
          />
          <SpacingSlider
            label="Line spacing"
            value={style.spacing.line}
            onChange={(v) => set("spacing", { ...style.spacing, line: v })}
            format={(v) => `${mapRange(v, ...SPACING_RANGES.line).toFixed(2)}×`}
          />
          <SpacingSlider
            label="Page margins"
            value={style.spacing.margins}
            onChange={(v) => set("spacing", { ...style.spacing, margins: v })}
            format={(v) => `${mapRange(v, ...SPACING_RANGES.margins).toFixed(0)}pt`}
          />
        </div>
      </Group>

      <button
        type="button"
        onClick={() => onChange(buildDefaultStyle(style.theme, style.template))}
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset formatting
      </button>
    </div>
  );
}
