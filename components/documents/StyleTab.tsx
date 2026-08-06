"use client";

import { RotateCcw } from "lucide-react";

import { buildDefaultStyle } from "@/lib/resumeSections";
import type { ResumeTheme } from "@/components/documents/ResumePDF";
import type { ResumeStyle, ResumeTemplate } from "@/types/resumeEditor";

const TEMPLATE_LABELS: Record<ResumeTemplate, string> = {
  structured: "Structured",
  centered: "Centered",
  split: "Split",
};

const THEME_LABELS: Record<ResumeTheme, string> = {
  modern: "Modern",
  classic: "Classic",
  minimal: "Minimal",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  active,
  onSelect,
}: {
  options: { value: T; label: string }[];
  active: T;
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

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 text-xs text-text-secondary">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-32 cursor-pointer appearance-none rounded-full bg-border accent-accent"
      />
    </label>
  );
}

function TemplateThumbnail({ template }: { template: ResumeTemplate }) {
  if (template === "split") {
    return (
      <span className="flex h-14 gap-1 rounded bg-surface p-1.5">
        <span className="flex w-1/3 flex-col gap-1">
          <span className="h-1 w-full rounded-full bg-border" />
          <span className="h-0.5 w-2/3 rounded-full bg-border" />
          <span className="h-0.5 w-2/3 rounded-full bg-border" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="h-1 w-2/3 rounded-full bg-border" />
          <span className="h-0.5 w-full rounded-full bg-border" />
          <span className="h-0.5 w-5/6 rounded-full bg-border" />
        </span>
      </span>
    );
  }
  return (
    <span className={`flex h-14 flex-col gap-1 rounded bg-surface p-1.5 ${template === "centered" ? "items-center" : "items-start"}`}>
      <span className="h-1 w-2/3 rounded-full bg-border" />
      <span className="h-0.5 w-full rounded-full bg-border" />
      <span className="h-0.5 w-5/6 rounded-full bg-border" />
      <span className="mt-auto h-0.5 w-full rounded-full bg-border" />
    </span>
  );
}

type Props = { style: ResumeStyle; onChange: (next: ResumeStyle) => void };

export function StyleTab({ style, onChange }: Props) {
  function set<K extends keyof ResumeStyle>(key: K, value: ResumeStyle[K]) {
    onChange({ ...style, [key]: value });
  }

  return (
    <div className="flex flex-col gap-5">
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
          <select
            value={style.theme}
            onChange={(e) => set("theme", e.target.value as ResumeTheme)}
            className="h-9 rounded-lg border border-border bg-transparent px-2 text-xs text-text-primary outline-none"
          >
            {(Object.keys(THEME_LABELS) as ResumeTheme[]).map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Page size">
          <select
            value={style.pageSize}
            onChange={(e) => set("pageSize", e.target.value as ResumeStyle["pageSize"])}
            className="h-9 rounded-lg border border-border bg-transparent px-2 text-xs text-text-primary outline-none"
          >
            <option value="letter">Letter (8.5 × 11 in)</option>
            <option value="a4">A4 (210 × 297 mm)</option>
          </select>
        </Field>
      </div>

      <Field label="Accent colour">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={style.accentColorOverride ?? "#c9711f"}
            onChange={(e) => set("accentColorOverride", e.target.value)}
            className="h-9 w-9 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
          />
          <button
            type="button"
            onClick={() => set("accentColorOverride", null)}
            className="text-[11px] text-text-muted hover:text-text-primary"
          >
            Use theme default
          </button>
        </div>
      </Field>

      <div className="grid grid-cols-4 gap-2">
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

      {/* "centered" always centers the header — the alignment knob would be
          a no-op there, so it's hidden rather than shown-but-ignored. */}
      {style.template !== "centered" && (
        <Field label="Header alignment">
          <Segmented
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Centre" },
              { value: "right", label: "Right" },
            ]}
            active={style.headerAlignment}
            onSelect={(v) => set("headerAlignment", v)}
          />
        </Field>
      )}

      <Field label="Skills columns">
        <Segmented
          options={[
            { value: 2, label: "2" },
            { value: 3, label: "3" },
            { value: 4, label: "4" },
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

      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Spacing</span>
        <Slider label="Section spacing" value={style.spacing.section} onChange={(v) => set("spacing", { ...style.spacing, section: v })} />
        <Slider label="Entry spacing" value={style.spacing.entry} onChange={(v) => set("spacing", { ...style.spacing, entry: v })} />
        <Slider label="Line spacing" value={style.spacing.line} onChange={(v) => set("spacing", { ...style.spacing, line: v })} />
        <Slider label="Page margins" value={style.spacing.margins} onChange={(v) => set("spacing", { ...style.spacing, margins: v })} />
      </div>

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
