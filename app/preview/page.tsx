"use client";

/**
 * DESIGN PREVIEW — placeholder data only, not wired to the backend.
 *
 * Everything here renders the real components with dummy props so the design
 * can be reviewed before any backend work happens. Delete this route (and
 * nothing else) once the patterns are approved and wired for real.
 */

import { useState } from "react";
import {
    Ban,
    Building2,
    Calendar,
    Clock,
    DollarSign,
    Heart,
    MapPin,
    MessageCircle,
    Rocket,
    Search,
    Sparkles,
    Target,
    Users,
} from "lucide-react";

import {
    ResumeGapAnalysis,
    type ResumeGapAnalysisData,
} from "@/components/job-details/ResumeGapAnalysis";
import { NetworkSignals } from "@/components/shared/NetworkSignals";

const weakFit: ResumeGapAnalysisData = {
    score: 5.5,
    checks: [
        {
            label: "Job title",
            status: "warn",
            jobSide: ".NET Software Engineer",
            resumeSide: "Software Developer — close, but not the posting's language",
        },
        {
            label: "Years of experience",
            status: "pass",
            jobSide: "5+ years",
            resumeSide: "6 years",
        },
        {
            label: "Industry experience",
            status: "warn",
            jobSide: "Manufacturing, Electronics, Supply Chain",
            resumeSide: "Financial Services, Technology",
        },
        {
            label: "Seniority",
            status: "pass",
            jobSide: "Mid to Senior",
            resumeSide: "Mid-Level, 6 yrs — in range",
        },
        {
            label: "Summary",
            status: "fail",
            jobSide: "Should lead with .NET platform depth",
            resumeSide: "Generic summary, doesn't mention .NET at all",
        },
    ],
    matchedKeywords: [
        "C#",
        "ASP.NET Core MVC",
        "RESTful API Design",
        "SQL",
        "JavaScript",
        "CI/CD",
        "Docker",
        "Agile",
    ],
    missingKeywords: [".NET 10", "Oracle Database", "Entity Framework Core", "GitLab"],
};

const strongFit: ResumeGapAnalysisData = {
    score: 8.4,
    checks: [
        {
            label: "Job title",
            status: "pass",
            jobSide: "Senior Cloud Engineer",
            resumeSide: "Software Developer, cloud-focused — strong overlap",
        },
        {
            label: "Years of experience",
            status: "pass",
            jobSide: "5+ years",
            resumeSide: "6 years",
        },
        {
            label: "Industry experience",
            status: "pass",
            jobSide: "Financial Services",
            resumeSide: "Meridian Credit Union — direct match",
        },
        {
            label: "Summary",
            status: "warn",
            jobSide: "Emphasise cloud migration ownership",
            resumeSide: "Mentions migration, but buried in the third line",
        },
    ],
    matchedKeywords: ["Azure", "AWS", "Docker", "CI/CD", "Server Maintenance", "SQL", "Agile"],
    missingKeywords: ["Terraform"],
};

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

/** Sortie's answer to JobRight's % ring — letter grades, our language. */
function GradeRing({ grade, score }: { grade: string; score: number }) {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - Math.min(1, score / 5));
    const tone =
        grade === "A"
            ? "text-success"
            : grade === "B"
              ? "text-info"
              : grade === "C"
                ? "text-warning"
                : "text-error";

    return (
        <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100" aria-hidden>
                <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="8" className="stroke-border" />
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    stroke="currentColor"
                    className={tone}
                />
            </svg>
            <div className="absolute flex flex-col items-center leading-none">
                <span className="font-mono text-2xl font-bold text-text-primary">{grade}</span>
                <span className="mt-1 font-mono text-[9px] tracking-wide text-text-muted">
                    {score.toFixed(1)}/5
                </span>
            </div>
        </div>
    );
}

function DemoJobCard() {
    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex flex-col gap-4 p-5 sm:flex-row">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-text-muted">
                    <Building2 className="h-5 w-5" />
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    {/* Decision-support badges */}
                    <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-agent-light px-2.5 py-1 text-[11px] font-medium text-agent-dark">
                            <Clock className="h-3 w-3" />
                            Posted 57 min ago
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-lightest px-2.5 py-1 text-[11px] font-medium text-success-foreground">
                            <Users className="h-3 w-3" />
                            Under 25 applicants
                        </span>
                        <span className="rounded-full bg-accent-muted px-2.5 py-1 text-[11px] font-medium text-accent">
                            Be an early applicant
                        </span>
                        <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-text-muted">
                            Sponsors H-1B · 5 filings in 2024
                        </span>
                    </div>

                    <div>
                        <h3 className="text-lg font-semibold leading-6 text-text-primary">
                            Senior Cloud Engineer
                        </h3>
                        <p className="text-sm text-text-muted">
                            Manulife · Financial Services · Public Company
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-sm text-text-secondary sm:grid-cols-3">
                        <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-text-muted" /> Toronto · Remote
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-text-muted" /> $107K – $200K
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-text-muted" /> Full-time · Senior
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
                            View evaluation
                        </button>
                        <button className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-text-secondary transition-colors hover:bg-surface-secondary">
                            <Heart className="h-4 w-4" /> Save
                        </button>
                        <button className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-text-secondary transition-colors hover:bg-surface-secondary">
                            <Ban className="h-4 w-4" /> Hide
                        </button>
                    </div>
                </div>

                {/* Sortie grade panel */}
                <div className="flex shrink-0 flex-row items-center gap-4 rounded-xl border border-border bg-surface-secondary p-4 sm:flex-col sm:justify-center">
                    <GradeRing grade="B" score={3.8} />
                    <div className="text-center">
                        <p className="text-sm font-semibold text-text-primary">Good match</p>
                        <p className="text-xs text-text-muted">10-dimension grade</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

const LOADING_TIPS = [
    {
        title: "Every job gets 10 dimensions",
        body: "Skills, seniority, comp, location, growth, culture, visa, effort, legitimacy — each graded with a reason you can read.",
    },
    {
        title: "We flag ghost listings",
        body: "Vague comp and generic boilerplate get graded harshly, so you don't waste an afternoon on a posting that isn't real.",
    },
    {
        title: "Tailoring never invents experience",
        body: "Sortie only mirrors keywords your actual history supports — no invented skills, ever.",
    },
];

function DemoLoadingState() {
    const [tip, setTip] = useState(0);
    return (
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-card">
            <div className="mx-auto flex max-w-lg flex-col items-center gap-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-muted text-accent">
                    <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div className="w-full">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
                        <div className="h-full w-2/3 rounded-full bg-accent transition-all duration-700" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-text-primary">
                        Evaluating 24 jobs against your profile…
                    </p>
                    <p className="text-xs text-text-muted">Usually about a minute</p>
                </div>

                <div className="w-full rounded-xl border border-border bg-surface-secondary p-5 text-left">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
                        While you wait
                    </p>
                    <h4 className="mt-2 text-sm font-semibold text-text-primary">
                        {LOADING_TIPS[tip].title}
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">
                        {LOADING_TIPS[tip].body}
                    </p>
                    <div className="mt-4 flex gap-1.5">
                        {LOADING_TIPS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setTip(i)}
                                aria-label={`Tip ${i + 1}`}
                                className={`h-1.5 rounded-full transition-all ${
                                    i === tip ? "w-6 bg-accent" : "w-1.5 bg-border"
                                }`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DemoFilters() {
    const filters = [
        "Canada",
        "Full Stack Engineer (+2)",
        "Mid Level (+1)",
        "Full-time",
        "Remote (+2)",
        "Posted this week",
    ];
    return (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <Search className="h-4 w-4 text-text-muted" />
                <span className="text-sm text-text-muted">Search by title or company</span>
            </div>
            <div className="flex flex-wrap gap-2">
                {filters.map((f) => (
                    <button
                        key={f}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
                    >
                        {f} ▾
                    </button>
                ))}
                <button className="rounded-full bg-accent-muted px-3 py-1.5 text-xs font-medium text-accent">
                    ••• All filters
                </button>
            </div>
            <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Saved searches
                </p>
                <span className="inline-flex items-center gap-2 rounded-lg border-l-2 border-accent bg-surface-secondary px-3 py-2 text-sm text-text-secondary">
                    Full Stack Engineer + 1 role, Canada
                </span>
            </div>
        </div>
    );
}

/** Long AI waits: say how long it takes, and show what it costs. */
function DemoGenerationProgress() {
    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                <h3 className="text-sm font-semibold text-text-primary">
                    Tailoring your resume
                </h3>
                <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] text-text-muted">
                    9 of 10 generations left today
                </span>
            </div>
            <div className="flex flex-col items-center gap-4 p-8 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-muted text-accent">
                    <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div className="w-full max-w-sm">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
                        <div className="h-full w-1/2 rounded-full bg-accent" />
                    </div>
                </div>
                <div>
                    <p className="text-sm font-medium text-text-primary">
                        Rewriting your experience for this role…
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-text-muted">
                        <Clock className="h-3.5 w-3.5" />
                        Usually takes 10–20 seconds
                    </p>
                </div>
            </div>
        </div>
    );
}

const COACHING_CARDS = [
    {
        icon: Rocket,
        title: "I'm applying but hearing nothing",
        body: "Find out where you're actually getting filtered out, and fix it.",
    },
    {
        icon: Target,
        title: "I don't know which jobs to chase",
        body: "Get a shortlist worth your effort instead of 200 maybes.",
    },
    {
        icon: MessageCircle,
        title: "I have an interview coming up",
        body: "Prep against this specific role's gaps, not generic questions.",
    },
];

/** Entry points framed as the user's problem, not our feature list. */
function DemoCoaching() {
    return (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="mb-6 text-center">
                <h3 className="text-xl font-bold leading-tight text-text-primary">
                    Where do you need the most help?
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                    Pick the one that sounds like you.
                </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {COACHING_CARDS.map(({ icon: Icon, title, body }) => (
                    <div
                        key={title}
                        className="flex flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-5 transition-colors hover:border-accent"
                    >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-muted text-accent">
                            <Icon className="h-4.5 w-4.5" />
                        </span>
                        <h4 className="text-sm font-semibold leading-5 text-text-primary">{title}</h4>
                        <p className="flex-1 text-xs leading-5 text-text-muted">{body}</p>
                        <button className="mt-1 inline-flex w-fit items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                            Start here →
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function PreviewPage() {
    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-14 px-4 py-12 sm:px-6 lg:px-8">
            <header>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                    Sortie · Design preview
                </p>
                <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary">
                    New UI patterns, placeholder data
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                    Nothing here is wired to the backend — every value is dummy data so the design
                    can be reviewed first. Toggle light/dark in the navbar to check both themes.
                </p>
                <nav className="mt-4 flex flex-wrap gap-2">
                    {[
                        ["/preview/onboarding", "Onboarding flow"],
                        ["/preview/resume", "Résumé workspace"],
                        ["/preview/more", "Interview bank, settings & more"],
                    ].map(([href, label]) => (
                        <a
                            key={href}
                            href={href}
                            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
                        >
                            {label} →
                        </a>
                    ))}
                </nav>
            </header>

            <section>
                <SectionLabel note="the headline feature — shown before you generate anything">
                    Resume fit analysis
                </SectionLabel>
                <ResumeGapAnalysis
                    data={weakFit}
                    usageLabel="12 fit checks left today"
                    onImprove={() => {}}
                />
            </section>

            <section>
                <SectionLabel note="same component, strong-fit state">
                    Resume fit — strong result
                </SectionLabel>
                <ResumeGapAnalysis data={strongFit} usageLabel="11 fit checks left today" />
            </section>

            <section>
                <SectionLabel note="decision-support signals + Sortie letter grade">
                    Job card
                </SectionLabel>
                <DemoJobCard />
            </section>

            <section>
                <SectionLabel note="free — deep-links into LinkedIn search, no paid people API">
                    Network signals
                </SectionLabel>
                <NetworkSignals
                    company="Manulife"
                    signals={[
                        { kind: "colleague", count: 3, via: "Meridian Credit Union" },
                        { kind: "alumni", count: 5, via: "University of Windsor" },
                    ]}
                />
            </section>

            <section>
                <SectionLabel note="teaches a feature instead of showing a blank spinner">
                    Loading state
                </SectionLabel>
                <DemoLoadingState />
            </section>

            <section>
                <SectionLabel note="time expectation + visible cost, so waits don't feel broken">
                    Generation progress
                </SectionLabel>
                <DemoGenerationProgress />
            </section>

            <section>
                <SectionLabel note="the future premium tier, framed as problems not features">
                    Help entry points
                </SectionLabel>
                <DemoCoaching />
            </section>

            <section>
                <SectionLabel note="persistent chips + saved searches">
                    Filters
                </SectionLabel>
                <DemoFilters />
            </section>
        </main>
    );
}
