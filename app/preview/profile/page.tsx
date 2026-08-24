"use client";

/**
 * DESIGN PREVIEW — profile page redesign, "Command Center" direction
 * (2026-07-29, v2 — polish pass). Tabbed read-only summaries + a scoped edit
 * modal per section, reusing the app's real Tabs.tsx and mirroring
 * SettingsModal's centered glass-panel-strong chrome. This pass adds:
 * animation (entrance stagger via the existing .fade-in-up class, modal
 * enter/exit via tw-animate-css — both already real dependencies, nothing
 * new installed), a fresh icon set distinct from the first draft, and an
 * AI-bullet-suggestion affordance in Work Experience — teal (--color-agent),
 * never amber, per the app's own AI-content color rule. The AI rewrite here
 * is simulated locally (canned text) since this route has no backend wiring
 * by design; a real build would call the same Gemini bullet-rewrite prompt
 * agent/documents.ts / app/api/resume/generate/route.tsx already use for
 * résumé generation, just surfaced here too instead of only there.
 * Placeholder data only. See /preview/profile-document and
 * /preview/profile-split for the other two directions considered.
 */

import { useState } from "react";
import {
  Briefcase,
  Check,
  Contact,
  GraduationCap,
  GripVertical,
  Loader2,
  Palette,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

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

/* --------------------------------- data -------------------------------- */

const WORK_ENTRIES = [
  {
    company: "Meridian Credit Union",
    title: "Software Developer",
    start: "2022-08",
    end: "Present",
    bullets: [
      "Led migration of corporate applications to scalable cloud architecture on modern .NET frameworks",
      "Designed and managed end-to-end CI/CD pipelines across multiple environments",
      "Containerized application components with Docker to improve deployment consistency",
    ],
  },
  {
    company: "HCL Technologies",
    title: "Full-stack Developer",
    start: "2021-02",
    end: "2022-08",
    bullets: [
      "Developed container certification automation using ASP.NET MVC",
      "Deployed and maintained cloud infrastructure as part of the Microsoft Azure Security Team",
    ],
  },
];

const EDUCATION_ENTRIES = [
  {
    institution: "University of Windsor",
    degree: "Master's degree",
    field: "Electrical and Computer Engineering",
    year: "2020",
  },
  {
    institution: "Charotar University of Science and Technology",
    degree: "Bachelor's degree",
    field: "Computer Engineering",
    year: "2018",
  },
];

const SKILLS = ["Azure DevOps", ".NET / ASP.NET", "Angular", "Docker", "SQL", "REST APIs", "AWS", "Agile"];

// Canned "AI rewrite" — stands in for the real Gemini call this route can't
// make. Deliberately tighter and more achievement-focused than the source,
// same shape agent/documents.ts already asks for at résumé-generation time.
const REWRITE_MAP: Record<string, string> = {
  "Led migration of corporate applications to scalable cloud architecture on modern .NET frameworks":
    "Migrated 12+ corporate applications from legacy monoliths to a scalable .NET cloud architecture, cutting deployment time by 40%",
  "Designed and managed end-to-end CI/CD pipelines across multiple environments":
    "Architected end-to-end CI/CD pipelines across 4 environments, reducing release cycle time from days to hours",
  "Containerized application components with Docker to improve deployment consistency":
    "Containerized core services with Docker, eliminating environment-drift incidents and standardizing deploys across the team",
};

const GENERATED_BULLETS = [
  "Owned production reliability for customer-facing banking services, maintaining 99.9%+ uptime",
  "Mentored 2 junior developers on .NET best practices and code review standards",
];

/* ------------------------------- primitives ------------------------------ */

/** Small circular icon badge — same treatment Personal's avatar already
 * uses, now applied consistently to every section header instead of the
 * bare muted-gray inline icons the first draft had (the actual source of
 * the "off" look: one section had a polished badge, the other three had a
 * visual afterthought). */
function SectionIcon({
  icon: Icon,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-muted text-accent">
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </span>
  );
}

function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-lg p-1.5 text-accent transition-all duration-150 hover:scale-110 hover:bg-accent-muted active:scale-95"
    >
      <SquarePen className="h-3.5 w-3.5" />
    </button>
  );
}

/** Centered glass-chrome dialog, mirroring SettingsModal's exact recipe — a
 * new modal pattern here would fight the app's own "premium OS window" look
 * already shipped for Settings. Animated via tw-animate-css (already a real
 * dependency, see app/globals.css's `@import "tw-animate-css"`) — Settings
 * itself has no enter animation today, so this is a real upgrade worth
 * porting back, not just preview polish. */
function SectionModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="animate-in fade-in-0 fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-200"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 glass-panel-strong flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ personal tab ----------------------------- */

function PersonalTab() {
  const [editing, setEditing] = useState(false);
  return (
    <div className="fade-in-up card-interactive-glow rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-muted text-accent">
            <Contact className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-text-primary">Ridham Doshi</h3>
            <p className="text-sm text-text-secondary">Software Developer at Meridian Credit Union</p>
          </div>
        </div>
        <EditButton onClick={() => setEditing(true)} label="Edit personal info" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
          <Phone className="h-3.5 w-3.5 text-text-muted" /> 226-506-8168
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary">
          in/ridham-doshi
        </span>
      </div>

      {editing && (
        <SectionModal title="Edit Personal Info" onClose={() => setEditing(false)}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {["Full Name", "Phone Number", "Location", "LinkedIn URL"].map((label) => (
              <div key={label}>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {label}
                </label>
                <input
                  readOnly
                  defaultValue={
                    label === "Full Name"
                      ? "Ridham Doshi"
                      : label === "Phone Number"
                        ? "226-506-8168"
                        : label === "Location"
                          ? "Windsor, Ontario, Canada"
                          : "linkedin.com/in/ridham-doshi"
                  }
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary transition-shadow focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            ))}
          </div>
        </SectionModal>
      )}
    </div>
  );
}

/* ----------------------------- education tab ----------------------------- */

function EducationTab() {
  const [editing, setEditing] = useState(false);
  return (
    <div className="fade-in-up card-interactive-glow rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-lg font-bold text-text-primary">
          <SectionIcon icon={GraduationCap} />
          Education
        </h3>
        <EditButton onClick={() => setEditing(true)} label="Edit education" />
      </div>

      <div className="ml-4 space-y-5 border-l-2 border-agent-light pl-4">
        {EDUCATION_ENTRIES.map((e, i) => (
          <div
            key={e.institution}
            className="fade-in-up relative"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-agent bg-surface" />
            <p className="text-sm font-semibold text-text-primary">{e.institution}</p>
            <p className="text-sm text-text-secondary">
              {e.degree} in {e.field} · {e.year}
            </p>
          </div>
        ))}
      </div>

      {editing && (
        <SectionModal title="Edit Education" onClose={() => setEditing(false)}>
          <div className="space-y-5">
            {EDUCATION_ENTRIES.map((e, i) => (
              <div key={e.institution} className="relative rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <GripVertical className="h-4 w-4 cursor-grab text-text-muted transition-colors hover:text-text-secondary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Degree {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove"
                    className="ml-auto rounded-md p-1 text-text-muted transition-colors hover:text-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    readOnly
                    defaultValue={e.institution}
                    placeholder="Institution"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary sm:col-span-2"
                  />
                  <input
                    readOnly
                    defaultValue={e.degree}
                    placeholder="Degree"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  />
                  <input
                    readOnly
                    defaultValue={e.field}
                    placeholder="Field of study"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  />
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
        </SectionModal>
      )}
    </div>
  );
}

/* --------------------------- work experience tab -------------------------- */

/** One bullet row in the edit modal — carries its own tiny "rewrite with AI"
 * state so a click can show a brief loading spin, then the swap, without
 * touching the other bullets. This is the concrete answer to "how would AI
 * suggestions show up at each step": scoped per-bullet, teal, opt-in. */
function BulletRow({ text, onRemove }: { text: string; onRemove: () => void }) {
  const [value, setValue] = useState(text);
  const [rewriting, setRewriting] = useState(false);
  const [justRewritten, setJustRewritten] = useState(false);
  const canRewrite = REWRITE_MAP[text] !== undefined;

  function rewrite() {
    if (!canRewrite || rewriting) return;
    setRewriting(true);
    window.setTimeout(() => {
      setValue(REWRITE_MAP[text]);
      setRewriting(false);
      setJustRewritten(true);
      window.setTimeout(() => setJustRewritten(false), 2200);
    }, 900);
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-5 transition-all duration-300 ${
        justRewritten
          ? "bg-agent-light text-agent-dark ring-1 ring-agent"
          : "bg-surface-secondary text-text-secondary"
      }`}
    >
      <span className="flex-1">{value}</span>
      {justRewritten && (
        <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-agent">
          <Check className="h-3 w-3" /> AI-rewritten
        </span>
      )}
      {canRewrite && !justRewritten && (
        <button
          type="button"
          onClick={rewrite}
          disabled={rewriting}
          aria-label="Rewrite this bullet with AI"
          title="Rewrite with AI"
          className="shrink-0 text-agent transition-transform hover:scale-110 disabled:opacity-60"
        >
          {rewriting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove bullet"
        className="shrink-0 text-text-muted transition-colors hover:text-error"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** The "generate from a rough note" composer — the other half of the AI
 * affordance: instead of rewriting existing text, produce new bullets from a
 * one-line note the user types, same teal-only-for-AI-content rule. */
function GenerateBulletsComposer({ onGenerate }: { onGenerate: (bullets: string[]) => void }) {
  const [note, setNote] = useState("");
  const [generating, setGenerating] = useState(false);

  function generate() {
    if (!note.trim() || generating) return;
    setGenerating(true);
    window.setTimeout(() => {
      onGenerate(GENERATED_BULLETS);
      setGenerating(false);
      setNote("");
    }, 900);
  }

  return (
    <div className="rounded-lg border border-dashed border-agent/40 bg-agent-muted/40 p-3">
      <label className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-agent-dark">
        <Sparkles className="h-3 w-3" />
        Generate bullets from a note
      </label>
      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. I kept the banking app up 24/7 and trained two juniors"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-agent"
        />
        <button
          type="button"
          onClick={generate}
          disabled={!note.trim() || generating}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-agent px-3 py-2 text-xs font-medium text-agent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {generating ? "Generating…" : "Generate"}
        </button>
      </div>
    </div>
  );
}

function WorkExperienceTab() {
  const [editing, setEditing] = useState(false);
  const [entries, setEntries] = useState(WORK_ENTRIES);

  function removeBullet(entryIndex: number, bulletIndex: number) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === entryIndex ? { ...e, bullets: e.bullets.filter((_, j) => j !== bulletIndex) } : e,
      ),
    );
  }

  function addGeneratedBullets(entryIndex: number, bullets: string[]) {
    setEntries((prev) =>
      prev.map((e, i) => (i === entryIndex ? { ...e, bullets: [...e.bullets, ...bullets] } : e)),
    );
  }

  return (
    <div className="fade-in-up card-interactive-glow rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-lg font-bold text-text-primary">
          <SectionIcon icon={Briefcase} />
          Work Experience
        </h3>
        <EditButton onClick={() => setEditing(true)} label="Edit work experience" />
      </div>

      <div className="ml-4 space-y-6 border-l-2 border-agent-light pl-4">
        {entries.map((w, i) => (
          <div key={w.company} className="fade-in-up relative" style={{ animationDelay: `${i * 80}ms` }}>
            <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-agent bg-surface" />
            <p className="font-mono text-[11px] tabular-nums text-text-muted">
              {w.start} → {w.end}
            </p>
            <p className="text-sm font-semibold text-text-primary">{w.company}</p>
            <p className="text-sm text-text-secondary">{w.title}</p>
            <ul className="mt-1.5 space-y-1">
              {w.bullets.slice(0, 2).map((b) => (
                <li key={b} className="flex gap-2 text-xs leading-5 text-text-muted">
                  <span className="text-accent">—</span> {b}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editing && (
        <SectionModal title="Edit Work Experience" onClose={() => setEditing(false)}>
          <div className="space-y-5">
            {entries.map((w, i) => (
              <div key={w.company} className="relative rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <GripVertical className="h-4 w-4 cursor-grab text-text-muted transition-colors hover:text-text-secondary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Role {i + 1}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove"
                    className="ml-auto rounded-md p-1 text-text-muted transition-colors hover:text-error"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    readOnly
                    defaultValue={w.title}
                    placeholder="Job title"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  />
                  <input
                    readOnly
                    defaultValue={w.company}
                    placeholder="Company"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  />
                  <input
                    readOnly
                    defaultValue={w.start}
                    placeholder="Start date"
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  />
                  <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary">
                    <input type="checkbox" defaultChecked={w.end === "Present"} className="accent-accent" />
                    Currently working here
                  </label>
                </div>

                <div className="mt-3 space-y-1.5">
                  {w.bullets.map((b, j) => (
                    <BulletRow key={b} text={b} onRemove={() => removeBullet(i, j)} />
                  ))}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-75"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add bullet point manually
                  </button>
                </div>

                <div className="mt-3">
                  <GenerateBulletsComposer onGenerate={(bullets) => addGeneratedBullets(i, bullets)} />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              Add role
            </button>
          </div>
        </SectionModal>
      )}
    </div>
  );
}

/* --------------------------------- skills tab ------------------------------ */

function SkillsTab() {
  const [editing, setEditing] = useState(false);
  return (
    <div className="fade-in-up card-interactive-glow rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-lg font-bold text-text-primary">
          <SectionIcon icon={Wrench} />
          Skills
        </h3>
        <EditButton onClick={() => setEditing(true)} label="Edit skills" />
      </div>
      <div className="flex flex-wrap gap-2">
        {SKILLS.map((s, i) => (
          <span
            key={s}
            style={{ animationDelay: `${i * 40}ms` }}
            className="fade-in-up rounded-full bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent transition-transform hover:scale-105"
          >
            {s}
          </span>
        ))}
      </div>

      {editing && (
        <SectionModal title="Edit Skills" onClose={() => setEditing(false)}>
          <div className="flex gap-2">
            <input
              placeholder="Add a skill and press Enter"
              className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SKILLS.map((s) => (
              <span
                key={s}
                className="flex items-center gap-1.5 rounded-full bg-accent-light px-3 py-1 text-xs font-medium text-accent transition-transform hover:scale-105"
              >
                {s}
                <X className="h-3 w-3 cursor-pointer" />
              </span>
            ))}
          </div>
        </SectionModal>
      )}
    </div>
  );
}

/* ------------------------------- assembled page ---------------------------- */

export default function ProfilePreviewPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          Sortie · Design preview
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary">
          Profile — &ldquo;Command Center&rdquo; direction, polished
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
          Tabbed read-only summaries, edit one section at a time via an animated scoped modal —
          reuses <code className="rounded bg-surface-secondary px-1 py-0.5 text-xs">Tabs.tsx</code>{" "}
          and mirrors{" "}
          <code className="rounded bg-surface-secondary px-1 py-0.5 text-xs">SettingsModal</code>
          &apos;s chrome. New in this pass: entrance/hover animation, a fresh icon set, and a teal
          AI-bullet-suggestion affordance in Work Experience.{" "}
          <a href="/preview" className="text-accent hover:underline">
            ← Back to the main preview
          </a>{" "}
          ·{" "}
          <a href="/preview/profile-document" className="text-accent hover:underline">
            Interactive Document →
          </a>{" "}
          ·{" "}
          <a href="/preview/profile-split" className="text-accent hover:underline">
            Split-View Canvas →
          </a>
        </p>
      </header>

      <section>
        <SectionLabel note="open Work Experience → the ✨ next to a bullet rewrites it with AI; the note box below generates new ones">
          Profile
        </SectionLabel>

        <Tabs
          defaultTabId="personal"
          tabs={[
            { id: "personal", label: "Personal", content: <PersonalTab /> },
            { id: "education", label: "Education", content: <EducationTab /> },
            { id: "work", label: "Work Experience", content: <WorkExperienceTab /> },
            { id: "skills", label: "Skills", content: <SkillsTab /> },
          ]}
        />
      </section>

      <section className="fade-in-up rounded-2xl border border-dashed border-border bg-surface-secondary p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-agent" />
          <div>
            <p className="text-sm font-medium text-text-primary">
              Where AI shows up, and where it deliberately doesn&apos;t
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-text-secondary">
              <li className="flex items-center gap-2">
                <Palette className="h-3.5 w-3.5 text-text-muted" /> Amber (
                <code className="text-accent">--color-accent</code>) for every user edit action —
                pencil icons, save buttons, tag inputs
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-text-muted" /> Teal (
                <code className="text-agent">--color-agent</code>) only for AI output — the bullet
                rewrite ✨, the &ldquo;generate from a note&rdquo; box, and the confirmation chip
                after a rewrite lands
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-text-muted" /> Nothing here auto-runs — every
                AI action is a deliberate click, same opt-in pattern as Leadership/Insider
                Connections elsewhere in the app
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
