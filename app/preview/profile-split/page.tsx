"use client";

/**
 * DESIGN PREVIEW — profile page redesign, "Split-View Canvas" direction.
 * Sticky left nav (glass chrome) + right editing canvas, auto-save, no
 * modals. Desktop power-user optimized — deliberately NOT responsive here,
 * to make the con (falls apart on mobile) visible rather than hidden.
 * Placeholder data only, not wired to anything. See /preview/profile
 * (Command Center) and /preview/profile-document (Interactive Document) for
 * the other two directions considered, discussed in chat.
 */

import { useState } from "react";
import {
  Briefcase,
  Check,
  GraduationCap,
  Plus,
  Sliders,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";

function SectionLabel({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-3">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
        {children}
      </h2>
      {note && <span className="text-xs text-text-muted">{note}</span>}
    </div>
  );
}

const NAV = [
  { id: "personal", label: "Personal", icon: User },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "work", label: "Work Experience", icon: Briefcase },
  { id: "preferences", label: "Preferences", icon: Sliders },
];

function AutoSaveIndicator({ saved }: { saved: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
        saved ? "text-success" : "text-text-muted"
      }`}
    >
      {saved ? <Check className="h-3 w-3" /> : <Sparkles className="h-3 w-3 animate-pulse" />}
      {saved ? "Saved" : "Saving…"}
    </span>
  );
}

function PersonalCanvas() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {["Full Name", "Phone Number", "Location", "LinkedIn URL"].map((label) => (
          <div key={label}>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary">
              {label}
            </label>
            <input
              defaultValue={
                label === "Full Name"
                  ? "Ridham Doshi"
                  : label === "Phone Number"
                    ? "226-506-8168"
                    : label === "Location"
                      ? "Windsor, Ontario, Canada"
                      : "linkedin.com/in/ridham-doshi"
              }
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EducationCanvas() {
  const entries = [
    { institution: "University of Windsor", degree: "Master's degree", year: "2020" },
    { institution: "Charotar University of Science and Technology", degree: "Bachelor's degree", year: "2018" },
  ];
  return (
    <div className="space-y-4">
      {entries.map((e, i) => (
        <div key={e.institution} className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Degree {i + 1}
            </span>
            <button type="button" aria-label="Remove" className="text-text-muted hover:text-error">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              defaultValue={e.institution}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary sm:col-span-2"
            />
            <input defaultValue={e.degree} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary" />
            <input defaultValue={e.year} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary" />
          </div>
        </div>
      ))}
      <button
        type="button"
        className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" />
        Add degree
      </button>
    </div>
  );
}

function WorkCanvas() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input defaultValue="Software Developer" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary" />
          <input defaultValue="Meridian Credit Union" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary" />
        </div>
        <textarea
          rows={3}
          defaultValue="Led migration of corporate applications to scalable cloud architecture on modern .NET frameworks. Designed and managed end-to-end CI/CD pipelines."
          className="mt-3 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        />
      </div>
      <button
        type="button"
        className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <Plus className="h-3.5 w-3.5" />
        Add role
      </button>
    </div>
  );
}

function PreferencesCanvas() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {["Remote Preference", "Salary Expectation"].map((label) => (
        <div key={label}>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary">
            {label}
          </label>
          <input
            defaultValue={label === "Remote Preference" ? "Remote Only" : "$110,000 – $130,000"}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      ))}
    </div>
  );
}

const CANVASES: Record<string, React.ComponentType> = {
  personal: PersonalCanvas,
  education: EducationCanvas,
  work: WorkCanvas,
  preferences: PreferencesCanvas,
};

export default function ProfileSplitPreviewPage() {
  const [activeSection, setActiveSection] = useState("education");
  const [saved, setSaved] = useState(true);
  const ActiveCanvas = CANVASES[activeSection];

  function touch() {
    setSaved(false);
    window.setTimeout(() => setSaved(true), 900);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          Sortie · Design preview
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary">
          Profile — &ldquo;Split-View Canvas&rdquo; direction
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
          Sticky left nav, full editing canvas on the right, auto-save — fastest for power users
          switching between sections, but explicitly desktop-only.{" "}
          <a href="/preview/profile" className="text-accent hover:underline">
            ← Command Center
          </a>{" "}
          ·{" "}
          <a href="/preview/profile-document" className="text-accent hover:underline">
            Interactive Document →
          </a>
        </p>
      </header>

      <section>
        <SectionLabel note="click a section on the left, type in a field on the right to trigger auto-save">
          Profile
        </SectionLabel>

        <div className="grid grid-cols-[220px_1fr] overflow-hidden rounded-2xl border border-border shadow-card">
          {/* Sticky nav — the one place Liquid Glass belongs, per our own rule:
              chrome, not content. Deliberately NOT given a mobile fallback
              (no grid-cols-1 stack, no flex-wrap) — shrink the window and
              this breaks for real, which is the point: a real build needs
              separate mobile work this preview doesn't show. */}
          <nav className="glass-panel-strong flex flex-col gap-1 p-3">
            {NAV.map(({ id, label, icon: Icon }) => {
              const isActive = id === activeSection;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveSection(id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors md:w-full ${
                    isActive
                      ? "bg-accent-light text-accent"
                      : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Canvas */}
          <div className="bg-surface p-6" onInput={touch}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">
                {NAV.find((n) => n.id === activeSection)?.label}
              </h3>
              <AutoSaveIndicator saved={saved} />
            </div>
            <ActiveCanvas />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-surface-secondary p-5">
        <div className="flex items-start gap-3">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-error" />
          <div>
            <p className="text-sm font-medium text-text-primary">The con, made visible</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              Shrink this window below ~500px and the two-column layout doesn&apos;t degrade
              gracefully — the nav and canvas just compress into an unusable strip. A real build
              needs a genuinely separate mobile UI (stacked accordion, or falling back to modals
              like Command Center), which is real net-new work this preview doesn&apos;t show.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
