"use client";

/**
 * DESIGN PREVIEW — remaining surfaces, placeholder data only.
 * Covers: interview question bank, notifications, settings/account, beta launch modal.
 */

import { useState } from "react";
import {
    Bell,
    CreditCard,
    Inbox,
    LogOut,
    Play,
    Search,
    Shield,
    Ticket,
    Trash2,
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

/* ------------------------------ interview bank ------------------------------ */

const TIERS = [
    {
        tier: "Big tech",
        lead: {
            name: "Google",
            blurb: "Build tools used by billions. Expect systems depth and a long loop.",
            total: 514,
            recent: 66,
        },
        others: [
            { name: "Apple", count: 185 },
            { name: "Meta", count: 557 },
            { name: "Amazon", count: 436 },
            { name: "Netflix", count: 115 },
        ],
    },
    {
        tier: "AI labs",
        lead: {
            name: "OpenAI",
            blurb: "Research-adjacent engineering. Heavy on reasoning and system design.",
            total: 529,
            recent: 52,
        },
        others: [
            { name: "Anthropic", count: 255 },
            { name: "NVIDIA", count: 97 },
            { name: "Databricks", count: 171 },
            { name: "xAI", count: 60 },
        ],
    },
];

function InterviewBank() {
    return (
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
                <div>
                    <h3 className="text-lg font-bold text-text-primary">Real interview questions</h3>
                    <p className="text-sm text-text-secondary">
                        Reported by candidates, grouped by company.
                    </p>
                </div>
                <div className="flex gap-6">
                    {[
                        ["393", "Companies"],
                        ["8,901", "Questions"],
                        ["+1,162", "Last 30 days"],
                    ].map(([n, l]) => (
                        <div key={l}>
                            <p className="font-mono text-xl font-bold tabular-nums text-text-primary">
                                {n}
                            </p>
                            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                                {l}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <Search className="h-4 w-4 text-text-muted" />
                <span className="text-sm text-text-muted">Search a company or question…</span>
            </div>

            <div className="mt-6 flex flex-col gap-8">
                {TIERS.map((t) => (
                    <div key={t.tier}>
                        <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-accent">
                            {t.tier}
                        </p>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                            <div className="rounded-xl border border-border bg-surface-secondary p-5">
                                <p className="text-base font-semibold text-text-primary">
                                    {t.lead.name}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-text-muted">{t.lead.blurb}</p>
                                <div className="mt-4 flex gap-6">
                                    <div>
                                        <p className="font-mono text-lg font-bold tabular-nums text-text-primary">
                                            {t.lead.total}
                                        </p>
                                        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                                            Questions
                                        </p>
                                    </div>
                                    <div>
                                        <p className="font-mono text-lg font-bold tabular-nums text-success">
                                            +{t.lead.recent}
                                        </p>
                                        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                                            Last 30 days
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {t.others.map((o) => (
                                    <div
                                        key={o.name}
                                        className="flex flex-col justify-center rounded-xl border border-border p-4 transition-colors hover:border-accent"
                                    >
                                        <p className="text-sm font-medium text-text-primary">{o.name}</p>
                                        <p className="font-mono text-xs tabular-nums text-text-muted">
                                            {o.count} questions
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <button className="mt-6 text-xs font-medium text-accent hover:underline">
                + Contribute a question you were asked
            </button>
        </div>
    );
}

/* ------------------------------- notifications ------------------------------ */

function NotificationsEmpty() {
    return (
        <div className="rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-border p-5">
                <Bell className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
            </div>
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-secondary text-text-muted">
                    <Inbox className="h-6 w-6" />
                </span>
                <p className="text-sm font-medium text-text-primary">Nothing here yet</p>
                <p className="max-w-xs text-xs leading-5 text-text-muted">
                    When a job you saved changes, an application goes quiet, or an A-grade match
                    appears, it&apos;ll show up here.
                </p>
            </div>
        </div>
    );
}

/* --------------------------------- settings --------------------------------- */

const SETTINGS_NAV = [
    { icon: Shield, label: "Login & security", active: true },
    { icon: CreditCard, label: "Subscription" },
    { icon: Ticket, label: "Credits & usage" },
    { icon: Bell, label: "Job alerts" },
];

function SettingsPanel() {
    return (
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-card sm:grid-cols-[minmax(0,0.4fr)_minmax(0,1fr)]">
            <div className="flex flex-col justify-between border-b border-border bg-surface-secondary p-4 sm:border-b-0 sm:border-r">
                <div className="flex flex-col gap-1">
                    {SETTINGS_NAV.map(({ icon: Icon, label, active }) => (
                        <button
                            key={label}
                            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                active
                                    ? "bg-accent-muted font-medium text-accent"
                                    : "text-text-secondary hover:bg-surface"
                            }`}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            {label}
                        </button>
                    ))}
                </div>
                <button className="mt-6 flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-muted transition-colors hover:text-text-primary">
                    <LogOut className="h-4 w-4" />
                    Sign out
                </button>
            </div>

            <div className="flex flex-col gap-6 p-6">
                <h3 className="text-base font-semibold text-text-primary">Login &amp; security</h3>

                <div className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        Email
                    </span>
                    <span className="text-sm text-text-secondary">you@example.com</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                    <div>
                        <p className="text-sm font-medium text-text-primary">Password</p>
                        <p className="text-xs text-text-muted">Send yourself a reset link</p>
                    </div>
                    <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-surface-secondary">
                        Reset password
                    </button>
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-error/30 bg-error/5 p-4">
                    <div>
                        <p className="text-sm font-medium text-error">Delete account</p>
                        <p className="mt-1 text-xs leading-5 text-text-secondary">
                            Permanently erases your profile, résumés, saved jobs, evaluations and
                            generated documents. This cannot be undone.
                        </p>
                    </div>
                    <button className="inline-flex min-h-9 w-fit items-center gap-2 rounded-lg bg-error px-4 text-sm font-medium text-error-foreground transition-opacity hover:opacity-90">
                        <Trash2 className="h-4 w-4" />
                        Delete my account
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------ beta announcement --------------------------- */

function BetaModal() {
    const [open, setOpen] = useState(true);
    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-secondary"
            >
                Show the announcement modal again
            </button>
        );
    }
    return (
        <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex justify-end p-3 pb-0">
                <button
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
            <div className="flex flex-col items-center gap-4 px-6 pb-6 text-center">
                <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-muted px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-accent">
                        Beta
                    </span>
                    <h3 className="mt-3 text-xl font-bold leading-tight text-text-primary">
                        Meet the Sortie Agent
                    </h3>
                    <p className="mt-1 text-sm text-text-secondary">
                        It watches the market while you get on with your week.
                    </p>
                </div>

                <button className="flex aspect-video w-full items-center justify-center rounded-xl bg-surface-secondary transition-colors hover:bg-accent-muted">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        <Play className="ml-0.5 h-5 w-5" />
                    </span>
                </button>

                <div className="grid w-full grid-cols-3 gap-2">
                    {[
                        ["A-grade only", "What it pings you for"],
                        ["Weekly", "How often it checks"],
                        ["0", "Emails you didn't ask for"],
                    ].map(([n, l]) => (
                        <div key={l}>
                            <p className="text-sm font-bold text-text-primary">{n}</p>
                            <p className="text-[10px] leading-4 text-text-muted">{l}</p>
                        </div>
                    ))}
                </div>

                <div className="flex w-full flex-col gap-2">
                    <span className="mx-auto rounded-full bg-surface-secondary px-3 py-1 font-mono text-[10px] text-text-muted">
                        You&apos;re #47 on the waitlist
                    </span>
                    <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
                        Join the beta
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function MorePreviewPage() {
    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12 sm:px-6 lg:px-8">
            <header>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                    Sortie · Design preview
                </p>
                <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary">
                    Interview bank, notifications &amp; settings
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                    The remaining surfaces, placeholder data.{" "}
                    <a href="/preview" className="text-accent hover:underline">
                        ← Back to the main preview
                    </a>
                </p>
            </header>

            <section>
                <SectionLabel note="community-contributed, grouped by company tier">
                    Interview question bank
                </SectionLabel>
                <InterviewBank />
            </section>

            <section>
                <SectionLabel note="empty state that explains what will appear">
                    Notifications
                </SectionLabel>
                <NotificationsEmpty />
            </section>

            <section>
                <SectionLabel note="includes account deletion — a Phase 0 legal requirement">
                    Settings
                </SectionLabel>
                <SettingsPanel />
            </section>

            <section>
                <SectionLabel note="feature launch + waitlist, for gating expensive betas">
                    Announcement modal
                </SectionLabel>
                <BetaModal />
            </section>
        </main>
    );
}
