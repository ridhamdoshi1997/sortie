"use client";

/**
 * DESIGN PREVIEW — resume workspace, placeholder data only.
 * Covers: multi-resume manager, section editor (drag to reorder), style controls.
 * Not wired to anything.
 */

import { useEffect, useRef, useState } from "react";
import {
    ArrowLeftRight,
    Check,
    ChevronDown,
    Download,
    FileUp,
    GripVertical,
    Loader2,
    MoreHorizontal,
    Pencil,
    PencilLine,
    Plus,
    RefreshCw,
    RotateCcw,
    Sparkles,
    Star,
    Tag,
    Trash2,
    Upload,
    Wand2,
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

/* ---------------------------------- manager --------------------------------- */

// Persona is a research idea from the Gemini pass: instead of naming slots
// after a single job application, tag each with the *kind* of role it's
// built for — lets a job-details page later recommend "use your Enterprise
// Leadership résumé for this one" instead of the user guessing which of 5
// files fits. User-assigned (amber), separate from the AI-suggested-match
// idea shown below the table (teal).
const RESUMES = [
    {
        name: "Base résumé",
        persona: "General",
        target: "—",
        primary: true,
        status: "Analysed",
        modified: "an hour ago",
        created: "2 hours ago",
        newSinceLastTouch: 3,
    },
    {
        name: "Celestica · .NET Software Engineer",
        persona: "Enterprise Backend",
        target: ".NET Software Engineer",
        primary: false,
        status: "Tailored",
        modified: "12 minutes ago",
        created: "12 minutes ago",
        newSinceLastTouch: 0,
    },
];

/* ------------------------------- actions menu -------------------------------- */

type MenuAction = "primary" | "sync" | "updateFromProfile" | "rename" | "export" | "delete";

function ActionsMenu({
    isPrimary,
    newSinceLastTouch,
    onAction,
    onClose,
}: {
    isPrimary: boolean;
    newSinceLastTouch: number;
    onAction: (action: MenuAction) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function onClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) onClose();
        }
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [onClose]);

    const items: Array<{
        key: MenuAction;
        label: string;
        badge?: string;
        icon: React.ComponentType<{ className?: string }>;
        tone?: "accent" | "agent" | "error";
        disabled?: boolean;
    }> = [
        { key: "primary", label: isPrimary ? "Already primary" : "Make primary", icon: Star, tone: "accent", disabled: isPrimary },
        { key: "sync", label: "Sync to profile", icon: RefreshCw, tone: "agent" },
        // Bi-directional sync, research idea #3: JobRight assumes the résumé
        // is the source of truth. We treat the profile as master, so this is
        // the reverse direction — pull newer profile achievements INTO an
        // older tailored résumé without disturbing its approved wording/layout.
        {
            key: "updateFromProfile",
            label: "Update from profile",
            badge: newSinceLastTouch > 0 ? `${newSinceLastTouch} new` : undefined,
            icon: ArrowLeftRight,
            tone: "agent",
            disabled: newSinceLastTouch === 0,
        },
        { key: "rename", label: "Rename", icon: PencilLine },
        { key: "export", label: "Export PDF", icon: Download },
        { key: "delete", label: "Delete", icon: Trash2, tone: "error", disabled: isPrimary },
    ];

    return (
        <div
            ref={ref}
            className="animate-in fade-in-0 zoom-in-95 absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-card duration-150"
        >
            {items.map(({ key, label, badge, icon: Icon, tone, disabled }) => (
                <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => onAction(key)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        tone === "accent"
                            ? "text-accent hover:bg-accent-muted"
                            : tone === "agent"
                              ? "text-agent hover:bg-agent-muted"
                              : tone === "error"
                                ? "text-error hover:bg-error/10"
                                : "text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                    }`}
                >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                    {badge && (
                        <span className="ml-auto rounded-full bg-agent-muted px-1.5 py-0.5 text-[9px] font-semibold text-agent">
                            {badge}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}

/* -------------------------------- sync modal ---------------------------------- */

const SYNC_SECTIONS = ["Personal", "Professional", "Education", "Certifications", "Work Experience", "Preferences"];

// Innovation #1 from the research pass: instead of a blind checkbox sync,
// show what would actually change before committing — teal for AI-proposed
// additions, muted strikethrough for what gets replaced. Builds trust with
// the "high-value candidate who fears an automated tool ruining their
// carefully-worded profile" persona this app is built for.
const SAMPLE_DIFF: Record<string, { added: string[]; replaced: string[] }> = {
    "Work Experience": {
        added: ["Containerized application components with Docker to improve deployment consistency"],
        replaced: ["Software development and product design."],
    },
    Professional: {
        added: ["Azure DevOps Services", "Production Deployment"],
        replaced: [],
    },
};

function SyncModal({ resumeName, onClose }: { resumeName: string; onClose: () => void }) {
    const [selected, setSelected] = useState<Set<string>>(new Set(SYNC_SECTIONS));
    const [stage, setStage] = useState<"select" | "review" | "syncing" | "done">("select");
    const [syncedCount, setSyncedCount] = useState(0);

    function toggle(section: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    }

    function startSync() {
        setStage("syncing");
        setSyncedCount(0);
        const total = selected.size;
        const interval = window.setInterval(() => {
            setSyncedCount((c) => {
                if (c + 1 >= total) {
                    window.clearInterval(interval);
                    window.setTimeout(() => setStage("done"), 300);
                }
                return c + 1;
            });
        }, 450);
    }

    const selectedList = Array.from(selected);
    const hasDiffPreview = selectedList.some((s) => SAMPLE_DIFF[s]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="glass-panel-strong animate-in fade-in-0 zoom-in-95 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div>
                        <h2 className="text-lg font-bold text-text-primary">Sync to profile</h2>
                        <p className="mt-0.5 text-xs text-text-muted">from &ldquo;{resumeName}&rdquo;</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {stage === "select" && (
                        <>
                            <p className="mb-4 text-sm text-text-secondary">
                                We&apos;ll use the latest content from this résumé to update matching sections in
                                your profile. Only selected sections change — nothing else is touched.
                            </p>
                            <div className="space-y-2">
                                {SYNC_SECTIONS.map((s) => (
                                    <label
                                        key={s}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-surface-secondary"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected.has(s)}
                                            onChange={() => toggle(s)}
                                            className="h-4 w-4 accent-accent"
                                        />
                                        <span className="text-sm text-text-primary">{s}</span>
                                        {SAMPLE_DIFF[s] && (
                                            <span className="ml-auto rounded-full bg-agent-muted px-2 py-0.5 text-[10px] font-medium text-agent">
                                                changes found
                                            </span>
                                        )}
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {stage === "review" && (
                        <>
                            <p className="mb-4 text-sm text-text-secondary">
                                Review what would change before confirming — nothing is written yet.
                            </p>
                            <div className="space-y-4">
                                {selectedList.map((s) => {
                                    const diff = SAMPLE_DIFF[s];
                                    return (
                                        <div key={s} className="rounded-xl border border-border p-4">
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{s}</p>
                                            {!diff ? (
                                                <p className="text-xs text-text-muted">No differences from what&apos;s already saved.</p>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {diff.replaced.map((line) => (
                                                        <p key={line} className="rounded-lg bg-error/10 px-2.5 py-1.5 text-xs text-error line-through decoration-error/60">
                                                            {line}
                                                        </p>
                                                    ))}
                                                    {diff.added.map((line) => (
                                                        <p key={line} className="flex items-start gap-1.5 rounded-lg bg-agent-light px-2.5 py-1.5 text-xs text-agent-dark">
                                                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                                                            {line}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {(stage === "syncing" || stage === "done") && (
                        <div className="space-y-2">
                            {selectedList.map((s, i) => {
                                const isDone = i < syncedCount || stage === "done";
                                const isActive = i === syncedCount && stage === "syncing";
                                return (
                                    <div key={s} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                                        <span className="text-sm text-text-primary">{s}</span>
                                        <span className="flex items-center gap-1.5 text-xs font-medium">
                                            {isDone ? (
                                                <span className="flex items-center gap-1 text-success">
                                                    <Check className="h-3.5 w-3.5" /> Synced
                                                </span>
                                            ) : isActive ? (
                                                <span className="flex items-center gap-1 text-agent">
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…
                                                </span>
                                            ) : (
                                                <span className="text-text-muted">Waiting…</span>
                                            )}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                    {stage === "select" && (
                        <>
                            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary">
                                Cancel
                            </button>
                            <button
                                onClick={() => setStage(hasDiffPreview ? "review" : "syncing")}
                                disabled={selected.size === 0}
                                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                                {hasDiffPreview ? "Review changes" : "Sync selected"}
                            </button>
                        </>
                    )}
                    {stage === "review" && (
                        <>
                            <button onClick={() => setStage("select")} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary">
                                Back
                            </button>
                            <button onClick={startSync} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
                                <Check className="h-3.5 w-3.5" />
                                Confirm sync
                            </button>
                        </>
                    )}
                    {stage === "done" && (
                        <button onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------ update-from-profile modal ------------------------------ */

const NEW_SINCE_LAST_TOUCH = [
    { section: "Work Experience", text: "Containerized application components with Docker to improve deployment consistency" },
    { section: "Professional", text: "Azure DevOps Services" },
    { section: "Professional", text: "Production Deployment" },
];

// Bi-directional sync's other half: résumé -> profile already exists as
// SyncModal above. This is profile -> résumé, for an OLDER tailored résumé
// that's fallen behind the profile's latest content. The trust concern here
// is different from SyncModal's ("don't silently overwrite my wording") —
// it's "don't wreck my approved layout/formatting for this specific
// application" — so the framing leads with that guarantee, not a diff.
function UpdateFromProfileModal({ resumeName, onClose }: { resumeName: string; onClose: () => void }) {
    const [included, setIncluded] = useState<Set<number>>(new Set(NEW_SINCE_LAST_TOUCH.map((_, i) => i)));
    const [stage, setStage] = useState<"review" | "merging" | "done">("review");

    function toggle(i: number) {
        setIncluded((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });
    }

    function startMerge() {
        setStage("merging");
        window.setTimeout(() => setStage("done"), 1600);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="glass-panel-strong animate-in fade-in-0 zoom-in-95 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <div>
                        <h2 className="text-lg font-bold text-text-primary">Update from profile</h2>
                        <p className="mt-0.5 text-xs text-text-muted">into &ldquo;{resumeName}&rdquo;</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {stage === "review" && (
                        <>
                            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-agent-light p-3.5 text-xs leading-5 text-agent-dark">
                                <Wand2 className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    Sortie weaves these into this résumé&apos;s existing wording and layout — your
                                    approved formatting for this application is never touched.
                                </span>
                            </div>
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                                {included.size} of {NEW_SINCE_LAST_TOUCH.length} selected — new since this résumé was last updated
                            </p>
                            <div className="space-y-2">
                                {NEW_SINCE_LAST_TOUCH.map((item, i) => (
                                    <label
                                        key={item.text}
                                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-surface-secondary"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={included.has(i)}
                                            onChange={() => toggle(i)}
                                            className="mt-0.5 h-4 w-4 accent-accent"
                                        />
                                        <span>
                                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                                                {item.section}
                                            </span>
                                            <span className="text-sm text-text-primary">{item.text}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </>
                    )}

                    {stage === "merging" && (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <Loader2 className="h-6 w-6 animate-spin text-agent" />
                            <p className="text-sm font-medium text-text-primary">Merging into your existing layout…</p>
                            <p className="text-xs text-text-muted">Wording and formatting are being preserved</p>
                        </div>
                    )}

                    {stage === "done" && (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success-lightest text-success">
                                <Check className="h-5 w-5" />
                            </span>
                            <p className="text-sm font-medium text-text-primary">Updated — layout preserved</p>
                            <p className="text-xs text-text-muted">{included.size} item{included.size === 1 ? "" : "s"} merged in</p>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                    {stage === "review" && (
                        <>
                            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary">
                                Cancel
                            </button>
                            <button
                                onClick={startMerge}
                                disabled={included.size === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                            >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                                Merge into résumé
                            </button>
                        </>
                    )}
                    {stage === "done" && (
                        <button onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------- upload modal ---------------------------------- */

function UploadModal({ onClose }: { onClose: () => void }) {
    const [dragging, setDragging] = useState(false);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="glass-panel-strong animate-in fade-in-0 zoom-in-95 relative w-full max-w-md rounded-2xl p-8 text-center duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary">
                    <X className="h-4 w-4" />
                </button>
                <h2 className="text-xl font-bold text-text-primary">Add a résumé</h2>
                <div
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                    }}
                    className={`mx-auto mt-6 flex h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors ${
                        dragging ? "border-accent bg-accent-muted" : "border-border bg-surface-secondary"
                    }`}
                >
                    <FileUp className={`h-6 w-6 ${dragging ? "text-accent" : "text-text-muted"}`} />
                    <p className="text-xs text-text-muted">Drop a file or click below</p>
                </div>
                <p className="mt-4 text-xs text-text-muted">PDF or LinkedIn profile PDF, up to 2MB.</p>
                <button className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90">
                    <Upload className="h-4 w-4" />
                    Upload
                </button>
            </div>
        </div>
    );
}

/* --------------------------------- manager table -------------------------------- */

function ResumeManager() {
    const [menuFor, setMenuFor] = useState<string | null>(null);
    const [syncFor, setSyncFor] = useState<string | null>(null);
    const [updateFromProfileFor, setUpdateFromProfileFor] = useState<string | null>(null);
    const [uploadOpen, setUploadOpen] = useState(false);

    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                <p className="text-sm text-text-secondary">
                    <span className="font-medium text-text-primary">2 of 5</span> résumé slots used
                </p>
                <button
                    onClick={() => setUploadOpen(true)}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
                >
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
                                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-text-muted">
                                        <Tag className="h-3 w-3" />
                                        {r.persona} persona
                                    </span>
                                </td>
                                <td className="px-5 py-4 text-text-secondary">{r.target}</td>
                                <td className="px-5 py-4 font-mono text-xs tabular-nums text-text-muted">
                                    {r.modified}
                                </td>
                                <td className="px-5 py-4 font-mono text-xs tabular-nums text-text-muted">
                                    {r.created}
                                </td>
                                <td className="relative px-5 py-4 text-right">
                                    <button
                                        onClick={() => setMenuFor(menuFor === r.name ? null : r.name)}
                                        className="rounded-lg p-1.5 text-text-muted hover:bg-surface-secondary hover:text-text-primary"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                    {menuFor === r.name && (
                                        <ActionsMenu
                                            isPrimary={r.primary}
                                            newSinceLastTouch={r.newSinceLastTouch}
                                            onClose={() => setMenuFor(null)}
                                            onAction={(action) => {
                                                setMenuFor(null);
                                                if (action === "sync") setSyncFor(r.name);
                                                if (action === "updateFromProfile") setUpdateFromProfileFor(r.name);
                                            }}
                                        />
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Illustrative only — shows where persona-matching would surface
               on a real job-details page, not built here. Teal because it's
               an AI recommendation, distinct from the persona TAG itself
               (user-assigned, shown muted in the table above). */}
            <div className="flex items-start gap-2.5 border-t border-border bg-agent-light/40 px-5 py-3.5 text-xs leading-5 text-agent-dark">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    <strong>On a job page, this becomes a recommendation:</strong> &ldquo;This posting reads
                    Enterprise Backend — use your Celestica résumé, or tailor a new one from Base.&rdquo;
                </span>
            </div>

            {syncFor && <SyncModal resumeName={syncFor} onClose={() => setSyncFor(null)} />}
            {updateFromProfileFor && (
                <UpdateFromProfileModal resumeName={updateFromProfileFor} onClose={() => setUpdateFromProfileFor(null)} />
            )}
            {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} />}
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
