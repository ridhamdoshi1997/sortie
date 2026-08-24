"use client";

/**
 * DESIGN PREVIEW — onboarding flow, placeholder data only.
 * Not wired to anything. Delete alongside app/preview once approved.
 */

import { useState } from "react";
import { Check, ChevronRight, Upload, X } from "lucide-react";

const CATEGORIES = [
    "Software / Internet / AI",
    "Data & Analytics",
    "Product",
    "Design",
    "Finance",
    "Marketing",
    "Operations",
    "Healthcare",
];

const ROLE_GROUPS: Record<string, { group: string; roles: string[] }[]> = {
    "Software / Internet / AI": [
        {
            group: "Backend & Platform",
            roles: [".NET Engineer", "Backend Engineer", "Platform Engineer", "Full Stack Engineer"],
        },
        {
            group: "Frontend / Mobile",
            roles: ["Frontend Engineer", "React Developer", "iOS Developer", "Android Developer"],
        },
        {
            group: "Reliability & Security",
            roles: ["DevOps Engineer", "Cloud Engineer", "Security Engineer", "SRE"],
        },
    ],
};

const SENIORITY = [
    { label: "Entry Level", detail: "0–2 years" },
    { label: "Mid Level", detail: "3–5 years" },
    { label: "Senior Level", detail: "6+ years, project leader" },
    { label: "Director / Executive", detail: "Director / VP / CXO" },
];

const SOURCES = [
    "Google search",
    "LinkedIn (job posting)",
    "LinkedIn (someone's post)",
    "YouTube",
    "TikTok",
    "Instagram",
    "Friend or colleague",
    "AI tools (like ChatGPT)",
    "Other",
];

function StepShell({
    step,
    total,
    question,
    children,
}: {
    step: number;
    total: number;
    question: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            {/* Left: the ask */}
            <div className="flex flex-col justify-between gap-8 border-b border-border bg-surface-secondary p-8 lg:border-b-0 lg:border-r">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                            S
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
                            Sortie · setup
                        </span>
                    </div>
                    <h2 className="mt-6 text-2xl font-bold leading-tight text-text-primary">
                        {question}
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    {Array.from({ length: total }).map((_, i) => (
                        <span
                            key={i}
                            className={`h-1.5 rounded-full transition-all ${
                                i < step ? "w-8 bg-accent" : "w-4 bg-border"
                            }`}
                        />
                    ))}
                    <span className="ml-2 font-mono text-[11px] text-text-muted">
                        {step} / {total}
                    </span>
                </div>
            </div>

            {/* Right: the input */}
            <div className="p-8">{children}</div>
        </div>
    );
}

function StepRoles() {
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [selected, setSelected] = useState<string[]>(["Full Stack Engineer", ".NET Engineer"]);

    function toggle(role: string) {
        setSelected((prev) =>
            prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
        );
    }

    return (
        <StepShell step={1} total={4} question="What kind of role are you looking for?">
            <div className="flex flex-col gap-5">
                {selected.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {selected.map((role) => (
                            <button
                                key={role}
                                onClick={() => toggle(role)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent"
                            >
                                {role}
                                <X className="h-3 w-3" />
                            </button>
                        ))}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div className="flex max-h-72 flex-col overflow-y-auto rounded-xl border border-border">
                        {CATEGORIES.map((c) => (
                            <button
                                key={c}
                                onClick={() => setCategory(c)}
                                className={`flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
                                    c === category
                                        ? "bg-accent-muted font-medium text-accent"
                                        : "text-text-secondary hover:bg-surface-secondary"
                                }`}
                            >
                                {c}
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            </button>
                        ))}
                    </div>

                    <div className="flex max-h-72 flex-col gap-4 overflow-y-auto rounded-xl border border-border p-3">
                        {(ROLE_GROUPS[category] ?? []).map((g) => (
                            <div key={g.group}>
                                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                                    {g.group}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {g.roles.map((role) => {
                                        const on = selected.includes(role);
                                        return (
                                            <button
                                                key={role}
                                                onClick={() => toggle(role)}
                                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                    on
                                                        ? "border-transparent bg-accent-muted text-accent"
                                                        : "border-border text-text-secondary hover:border-accent hover:text-accent"
                                                }`}
                                            >
                                                {role}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                        {!ROLE_GROUPS[category] && (
                            <p className="text-sm text-text-muted">
                                Roles for {category} would appear here.
                            </p>
                        )}
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">
                        Work authorization
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {["Citizen / PR", "Work permit", "Needs sponsorship", "Prefer not to say"].map(
                            (w, i) => (
                                <button
                                    key={w}
                                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                        i === 0
                                            ? "border-transparent bg-accent-muted text-accent"
                                            : "border-border text-text-secondary hover:border-accent hover:text-accent"
                                    }`}
                                >
                                    {w}
                                </button>
                            ),
                        )}
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                        Used for the visa/work-authorization dimension — never shared.
                    </p>
                </div>
            </div>
        </StepShell>
    );
}

function StepUpload() {
    const [uploaded, setUploaded] = useState(true);
    return (
        <StepShell step={2} total={4} question="Add your resume so we can grade jobs against it.">
            <div className="flex flex-col gap-5">
                {uploaded ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-secondary p-4">
                        <span className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-lightest text-success-foreground">
                                <Check className="h-5 w-5" />
                            </span>
                            <span className="flex flex-col">
                                <span className="text-sm font-medium text-text-primary">
                                    resume.pdf
                                </span>
                                <span className="text-xs text-text-muted">248 KB · uploaded</span>
                            </span>
                        </span>
                        <button
                            onClick={() => setUploaded(false)}
                            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
                            aria-label="Remove resume"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setUploaded(true)}
                        className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 transition-colors hover:border-accent"
                    >
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-muted text-accent">
                            <Upload className="h-5 w-5" />
                        </span>
                        <span className="text-sm font-medium text-text-primary">
                            Drop your resume or browse
                        </span>
                        <span className="text-xs text-text-muted">PDF or Word · max 10 MB</span>
                    </button>
                )}

                <div className="rounded-xl bg-agent-light p-4">
                    <p className="text-xs leading-6 text-agent-dark">
                        <strong>Your resume stays yours.</strong> It&apos;s used only to grade jobs
                        and tailor documents for you — never sold, never shared with employers or
                        third parties. You can delete it and your account at any time.
                    </p>
                </div>
            </div>
        </StepShell>
    );
}

function StepConfirm() {
    const [levels, setLevels] = useState<string[]>(["Senior Level"]);
    const [source, setSource] = useState("");

    return (
        <StepShell step={3} total={4} question="Last thing — how senior a role, and how did you find us?">
            <div className="flex flex-col gap-6">
                <div className="rounded-xl border border-border bg-surface-secondary p-4">
                    <p className="text-sm text-text-secondary">
                        We found{" "}
                        <span className="font-mono font-semibold text-accent">546 roles</span> that
                        could fit. Narrow it down:
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    {SENIORITY.map((s) => {
                        const on = levels.includes(s.label);
                        return (
                            <button
                                key={s.label}
                                onClick={() =>
                                    setLevels((prev) =>
                                        prev.includes(s.label)
                                            ? prev.filter((l) => l !== s.label)
                                            : [...prev, s.label],
                                    )
                                }
                                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                                    on ? "border-accent bg-accent-muted" : "border-border hover:bg-surface-secondary"
                                }`}
                            >
                                <span className="flex items-center gap-3">
                                    <span
                                        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                                            on
                                                ? "border-transparent bg-accent text-accent-foreground"
                                                : "border-border"
                                        }`}
                                    >
                                        {on && <Check className="h-3 w-3" />}
                                    </span>
                                    <span className="text-sm font-medium text-text-primary">
                                        {s.label}
                                    </span>
                                </span>
                                <span className="font-mono text-xs text-text-muted">{s.detail}</span>
                            </button>
                        );
                    })}
                </div>

                <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">
                        How did you find Sortie?
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {SOURCES.map((s) => (
                            <button
                                key={s}
                                onClick={() => setSource(s)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                    source === s
                                        ? "border-transparent bg-accent-muted text-accent"
                                        : "border-border text-text-secondary hover:border-accent hover:text-accent"
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                        Optional — it just tells us which channels actually work.
                    </p>
                </div>

                <button className="inline-flex min-h-11 w-fit items-center justify-center rounded-lg bg-accent px-6 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
                    Confirm &amp; see jobs
                </button>
            </div>
        </StepShell>
    );
}

export default function OnboardingPreviewPage() {
    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12 sm:px-6 lg:px-8">
            <header>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                    Sortie · Design preview
                </p>
                <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary">
                    Onboarding flow
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                    Four steps, placeholder data. Everything is interactive — click roles, chips and
                    checkboxes to see the states.{" "}
                    <a href="/preview" className="text-accent hover:underline">
                        ← Back to the main preview
                    </a>
                </p>
            </header>

            <StepRoles />
            <StepUpload />
            <StepConfirm />
        </main>
    );
}
