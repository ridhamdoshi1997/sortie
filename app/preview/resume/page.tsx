"use client";

/**
 * DESIGN PREVIEW — resume workspace, placeholder data only.
 * Covers: multi-resume manager, section editor (drag to reorder), style controls.
 * Not wired to anything.
 */

import { useState } from "react";
import {
    ChevronDown,
    GripVertical,
    MoreHorizontal,
    Pencil,
    Plus,
    RotateCcw,
    Sparkles,
    Star,
    Trash2,
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

/* ---------------------------------- manager --------------------------------- */

const RESUMES = [
    {
        name: "Base résumé",
        target: "—",
        primary: true,
        status: "Analysed",
        modified: "an hour ago",
        created: "2 hours ago",
    },
    {
        name: "Celestica · .NET Software Engineer",
        target: ".NET Software Engineer",
        primary: false,
        status: "Tailored",
        modified: "12 minutes ago",
        created: "12 minutes ago",
    },
];

function ResumeManager() {
    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                <p className="text-sm text-text-secondary">
                    <span className="font-medium text-text-primary">2 of 5</span> résumé slots used
                </p>
                <button className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
                    <Plus className="h-4 w-4" />
                    Add résumé
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                    <thead>
                        <tr className="bg-surface-secondary">
                            {["Résumé", "Target role", "Last modified", "Created", ""].map((h) => (
                                <th
                                    key={h}
                                    className="px-5 py-3 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {RESUMES.map((r) => (
                            <tr key={r.name} className="border-t border-border">
                                <td className="px-5 py-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium text-text-primary">{r.name}</span>
                                        {r.primary && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                                <Star className="h-3 w-3" />
                                                Primary
                                            </span>
                                        )}
                                        <span className="rounded-full bg-success-lightest px-2 py-0.5 text-[10px] font-medium text-success-foreground">
                                            {r.status}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-5 py-4 text-text-secondary">{r.target}</td>
                                <td className="px-5 py-4 font-mono text-xs tabular-nums text-text-muted">
                                    {r.modified}
                                </td>
                                <td className="px-5 py-4 font-mono text-xs tabular-nums text-text-muted">
                                    {r.created}
                                </td>
                                <td className="px-5 py-4 text-right">
                                    <button className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ---------------------------------- editor ---------------------------------- */

const SECTIONS = [
    "Personal info",
    "Professional summary",
    "Skills",
    "Work experience",
    "Education",
];

function EditorTab() {
    const [open, setOpen] = useState("Professional summary");
    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-agent-light p-4">
                <p className="text-xs leading-6 text-agent-dark">
                    <strong>Section order is saved everywhere.</strong> Other edits here apply only to
                    this tailored copy — to change your actual history, edit the base résumé.
                </p>
                <button className="mt-3 inline-flex min-h-8 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary">
                    Edit base résumé
                </button>
            </div>

            <div className="flex flex-col gap-2">
                {SECTIONS.map((s) => {
                    const isOpen = open === s;
                    return (
                        <div key={s} className="rounded-xl border border-border bg-surface-secondary">
                            <div className="flex items-center gap-2 px-3 py-2.5">
                                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-text-muted" />
                                <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-text-primary">
                                    {s}
                                </span>
                                <button className="rounded-md p-1 text-text-muted hover:text-accent">
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button className="rounded-md p-1 text-text-muted hover:text-error">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    onClick={() => setOpen(isOpen ? "" : s)}
                                    className="rounded-md p-1 text-text-muted hover:text-text-primary"
                                >
                                    <ChevronDown
                                        className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                    />
                                </button>
                            </div>
                            {isOpen && (
                                <div className="border-t border-border p-3">
                                    <textarea
                                        readOnly
                                        rows={5}
                                        className="w-full resize-none rounded-lg border border-border bg-surface p-3 text-xs leading-6 text-text-secondary outline-none focus-visible:border-accent"
                                        defaultValue=".NET Software Engineer with 6 years of experience designing scalable enterprise web applications using ASP.NET Core and C#. Skilled in architecting RESTful APIs and optimising database architectures with MS SQL, containerising services with Docker, and automating CI/CD pipelines in Azure and AWS."
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
                <button className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs font-medium text-text-muted transition-colors hover:border-accent hover:text-accent">
                    <Plus className="h-3.5 w-3.5" />
                    Add section
                </button>
            </div>
        </div>
    );
}

/* ----------------------------------- style ---------------------------------- */

function Slider({ label, value }: { label: string; value: number }) {
    return (
        <label className="flex items-center justify-between gap-4 text-xs text-text-secondary">
            <span>{label}</span>
            <input
                type="range"
                defaultValue={value}
                className="h-1 w-32 cursor-pointer appearance-none rounded-full bg-border accent-accent"
            />
        </label>
    );
}

function Segmented({ options, active }: { options: string[]; active: string }) {
    return (
        <div className="flex gap-1 rounded-lg border border-border p-1">
            {options.map((o) => (
                <button
                    key={o}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                        o === active
                            ? "bg-accent-muted text-accent"
                            : "text-text-muted hover:text-text-primary"
                    }`}
                >
                    {o}
                </button>
            ))}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {label}
            </span>
            {children}
        </div>
    );
}

function StyleTab() {
    return (
        <div className="flex flex-col gap-5">
            <Field label="Template">
                <div className="grid grid-cols-3 gap-2">
                    {["Centered", "Structured", "Split"].map((t, i) => (
                        <button
                            key={t}
                            className={`flex flex-col gap-2 rounded-lg border p-2 transition-colors ${
                                i === 2 ? "border-accent bg-accent-muted" : "border-border hover:border-accent"
                            }`}
                        >
                            <span className="flex h-14 flex-col gap-1 rounded bg-surface p-1.5">
                                <span className="h-1 w-2/3 rounded-full bg-border" />
                                <span className="h-0.5 w-full rounded-full bg-border" />
                                <span className="h-0.5 w-5/6 rounded-full bg-border" />
                                <span className="mt-auto h-0.5 w-full rounded-full bg-border" />
                            </span>
                            <span className="text-[10px] font-medium text-text-secondary">{t}</span>
                        </button>
                    ))}
                </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
                <Field label="Page size">
                    <select className="h-9 rounded-lg border border-border bg-transparent px-2 text-xs text-text-primary outline-none">
                        <option>Letter (8.5 × 11 in)</option>
                        <option>A4 (210 × 297 mm)</option>
                    </select>
                </Field>
                <Field label="Accent colour">
                    <div className="flex h-9 items-center gap-2 rounded-lg border border-border px-2">
                        <span className="h-4 w-4 rounded bg-accent" />
                        <span className="font-mono text-xs text-text-secondary">#C9711F</span>
                    </div>
                </Field>
            </div>

            <Field label="Font">
                <select className="h-9 rounded-lg border border-border bg-transparent px-2 text-xs text-text-primary outline-none">
                    <option>Helvetica (ATS-safe)</option>
                    <option>Times Roman (ATS-safe)</option>
                </select>
            </Field>

            <div className="grid grid-cols-4 gap-2">
                {[
                    ["Name", 21],
                    ["Headings", 12],
                    ["Sub-heads", 11],
                    ["Body", 10],
                ].map(([l, v]) => (
                    <Field key={l as string} label={l as string}>
                        <input
                            readOnly
                            defaultValue={v as number}
                            className="h-9 w-full rounded-lg border border-border bg-transparent px-2 text-center font-mono text-xs text-text-primary outline-none"
                        />
                    </Field>
                ))}
            </div>

            <Field label="Header alignment">
                <Segmented options={["Left", "Centre", "Right"]} active="Left" />
            </Field>

            <Field label="Skills columns">
                <Segmented options={["2", "3", "4"]} active="3" />
            </Field>

            <Field label="Bullet style">
                <Segmented options={["•", "—", "▪"]} active="—" />
            </Field>

            <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Spacing
                </span>
                <Slider label="Section spacing" value={40} />
                <Slider label="Entry spacing" value={20} />
                <Slider label="Line spacing" value={65} />
                <Slider label="Page margins" value={50} />
            </div>

            <button className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset formatting
            </button>
        </div>
    );
}

/* ---------------------------------- viewer ---------------------------------- */

function ResumeWorkspace() {
    const [tab, setTab] = useState<"editor" | "style">("style");

    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                        Tailored résumé · Celestica
                    </h3>
                    <p className="font-mono text-[11px] text-text-muted">Updated 12 minutes ago</p>
                </div>
                <button className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    Fit to one page
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                {/* Document */}
                <div className="border-b border-border bg-surface-secondary p-6 lg:border-b-0 lg:border-r">
                    <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow-card">
                        <p className="text-lg font-bold text-[#17181a]">Ridham Doshi</p>
                        <p className="text-[10px] text-[#4b4f4c]">
                            Software Developer · Toronto, ON · 226-506-8168
                        </p>
                        <div className="mt-3 border-b-2 border-accent" />
                        <p className="mt-3 font-mono text-[9px] font-bold uppercase tracking-wider text-accent">
                            Professional summary
                        </p>
                        <p className="mt-1 text-[9px] leading-relaxed text-[#4b4f4c]">
                            .NET Software Engineer with 6 years of experience designing scalable
                            enterprise web applications using ASP.NET Core and C#…
                        </p>
                        <p className="mt-3 font-mono text-[9px] font-bold uppercase tracking-wider text-accent">
                            Skills
                        </p>
                        <div className="mt-1 grid grid-cols-3 gap-1 text-[8px] text-[#4b4f4c]">
                            <span>C#</span>
                            <span>ASP.NET Core</span>
                            <span>Azure</span>
                            <span>JavaScript</span>
                            <span>.NET 10</span>
                            <span>Docker</span>
                        </div>
                        <p className="mt-3 font-mono text-[9px] font-bold uppercase tracking-wider text-accent">
                            Work experience
                        </p>
                        <p className="mt-1 text-[9px] font-semibold text-[#17181a]">
                            Meridian Credit Union · Software Developer
                        </p>
                        <p className="text-[8px] leading-relaxed text-[#4b4f4c]">
                            — Led migration of corporate applications to scalable cloud architecture on
                            modern .NET frameworks
                        </p>
                    </div>
                    <p className="mt-3 text-center font-mono text-[11px] text-text-muted">1 / 1</p>
                </div>

                {/* Controls */}
                <div className="flex flex-col">
                    <div className="flex gap-1 border-b border-border p-3">
                        {(["editor", "style"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                                    tab === t
                                        ? "bg-accent-muted text-accent"
                                        : "text-text-muted hover:text-text-primary"
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                    <div className="max-h-[560px] overflow-y-auto p-5">
                        {tab === "editor" ? <EditorTab /> : <StyleTab />}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-border bg-surface-secondary p-5">
                <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
                    Download PDF
                </button>
                <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface">
                    <Sparkles className="h-4 w-4 text-accent" />
                    Regenerate
                </button>
            </div>
        </div>
    );
}

export default function ResumePreviewPage() {
    return (
        <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-12 sm:px-6 lg:px-8">
            <header>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                    Sortie · Design preview
                </p>
                <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary">
                    Résumé workspace
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                    Multi-résumé manager, section editor and style controls — all placeholder data.{" "}
                    <a href="/preview" className="text-accent hover:underline">
                        ← Back to the main preview
                    </a>
                </p>
            </header>

            <section>
                <SectionLabel note="slots, primary flag, per-résumé status">
                    Résumé manager
                </SectionLabel>
                <ResumeManager />
            </section>

            <section>
                <SectionLabel note="live document + editor / style tabs">
                    Editor &amp; style controls
                </SectionLabel>
                <ResumeWorkspace />
            </section>
        </main>
    );
}
