"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bookmark, Search, MapPin, Briefcase, Loader2 } from "lucide-react";
import { scrapeAndEvaluateJobs, getJobsByIds } from "@/lib/actions/scraper.actions";
import { formatTimeAgo } from "@/lib/utils";
import { toUserMessage } from "@/lib/errors";
import { JobResultCard } from "@/components/shared/JobResultCard";
import type { ReappearanceSignal } from "@/lib/churnSignal";
import type { Job } from "@/types";

type Props = {
    userId: string;
    initialJobs?: Job[];
    reappearanceSignals?: Record<string, ReappearanceSignal>;
    lastRunAt?: string | null;
    initialTitle?: string | null;
    initialLocation?: string | null;
};

export function FindJobsForm({
    userId,
    initialJobs = [],
    reappearanceSignals = {},
    lastRunAt = null,
    initialTitle = "",
    initialLocation = "",
}: Props) {
    const [title, setTitle] = useState(initialTitle ?? "");
    const [location, setLocation] = useState(initialLocation ?? "");
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    // Distinguishes "haven't run a search this session yet" from "ran one,
    // got zero matches" — the latter needs its own empty state, not silence.
    const [hasSearched, setHasSearched] = useState(false);
    const [jobs, setJobs] = useState<Job[]>(initialJobs);
    // Only poll for jobs that haven't been scored yet — a page load with
    // already-scored history shouldn't start an indefinite refresh loop.
    const [jobIds, setJobIds] = useState<string[]>(
        initialJobs.filter((job) => job.match_score === null).map((job) => job.id)
    );
    // Same hydration-mismatch fix as JobActionBar.tsx's foundAtLabel —
    // formatTimeAgo(lastRunAt) computed inline in JSX renders a different
    // string at SSR-time than at client-hydration-time whenever real time
    // crosses a bucket boundary between those two moments.
    const [lastRunLabel, setLastRunLabel] = useState<string | null>(null);
    useEffect(() => {
        if (!lastRunAt) return;
        const timer = setTimeout(() => setLastRunLabel(formatTimeAgo(lastRunAt)), 0);
        return () => clearTimeout(timer);
    }, [lastRunAt]);

    const [filters, setFilters] = useState({
        visa_sponsorship: "",
        remote_policy: "",
    });
    const [showSavedOnly, setShowSavedOnly] = useState(false);

    // --- AUTO-REFRESH POLLING LOGIC ---
    // Polls by the exact set of job ids this search returned, not by
    // re-matching title/location text — a text re-match silently drops
    // results whose title or location is phrased differently than the
    // search box (e.g. "Software Engineer" vs "Software Developer", or
    // "Markham, ON" vs "Toronto, ON").
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (jobIds.length > 0) {
            interval = setInterval(async () => {
                try {
                    const updatedJobs = await getJobsByIds(jobIds);

                    if (updatedJobs && updatedJobs.length > 0) {
                        // Merge into the full list rather than replacing it —
                        // getJobsByIds only returns the polled (still-unscored)
                        // subset, and setJobs(updatedJobs) was wiping out every
                        // other already-scored job from view each tick.
                        setJobs((prev) =>
                            prev.map(
                                (job) => updatedJobs.find((updated) => updated.id === job.id) ?? job
                            )
                        );

                        // Stop polling once every job we're watching has a score.
                        if (updatedJobs.every((job) => job.match_score !== null)) {
                            clearInterval(interval);
                        }
                    }
                } catch (error) {
                    console.error("Polling failed:", error);
                }
            }, 3000);
        }

        return () => clearInterval(interval);
    }, [jobIds]);
    // ----------------------------------

    const updateFilter = (key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSearchError(null);

        try {
            const savedJobs = await scrapeAndEvaluateJobs(title, location, filters, userId);
            setJobs(savedJobs ?? []);
            setJobIds((savedJobs ?? []).map((job) => job.id));
            setHasSearched(true);
        } catch (error) {
            console.error("Pipeline failed:", error);
            setSearchError(toUserMessage(error, "Search failed. Please try again."));
        } finally {
            setLoading(false);
        }
    };

    const savedCount = jobs.filter((job) => job.is_saved).length;
    const visibleJobs = showSavedOnly ? jobs.filter((job) => job.is_saved) : jobs;

    return (
        <div className="mx-auto mt-0 w-full max-w-6xl space-y-8">
            {/* Mission console — dark ink chrome, matches the app-wide brand frame */}
            <div className="glass-panel-overlay rounded-2xl p-8 md:p-12">
                <div className="mb-8 max-w-2xl">
                    <h2 className="fade-in-up mb-3 flex items-center gap-2 text-3xl font-bold tracking-tight text-overlay-foreground md:text-4xl">
                        <span className="text-accent">&#9670;</span>
                        Run a sortie
                    </h2>
                    <p className="text-lg text-overlay-foreground/60">
                        Scan the field and score every result against your profile before you spend a click on it.
                    </p>
                </div>

                <div className="mb-6 grid w-full grid-cols-1 gap-4 md:grid-cols-2">
                    {Object.entries(filters).map(([key, value]) => (
                        <div key={key} className="flex flex-col gap-1">
                            <label className="font-mono text-xs font-semibold uppercase tracking-wider text-overlay-foreground/50">
                                {key.replace("_", " ")}
                            </label>
                            <Input
                                value={value}
                                onChange={(e) => updateFilter(key, e.target.value)}
                                className="rounded-lg border-overlay-foreground/15 bg-overlay-foreground/8 text-overlay-foreground placeholder:text-overlay-foreground/40"
                                placeholder={
                                    key === "visa_sponsorship"
                                        ? "e.g. Must support TN Visa for Canadian citizens"
                                        : key === "remote_policy"
                                            ? "e.g. Must allow remote work"
                                            : undefined
                                }
                            />
                        </div>
                    ))}
                </div>

                <form
                    onSubmit={handleSearch}
                    className="flex flex-col gap-4 rounded-xl border border-overlay-foreground/10 bg-overlay-dark/50 p-4 shadow-inner backdrop-blur-md md:flex-row"
                >
                    <div className="relative flex-1">
                        <Briefcase className="absolute top-3.5 left-4 h-5 w-5 text-overlay-foreground/40" />
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="h-12 rounded-lg border-overlay-foreground/15 bg-overlay-foreground/8 pl-12 text-lg text-overlay-foreground placeholder:text-overlay-foreground/40"
                            placeholder="Target role"
                            required
                        />
                    </div>
                    <div className="relative flex-1">
                        <MapPin className="absolute top-3.5 left-4 h-5 w-5 text-overlay-foreground/40" />
                        <Input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="h-12 rounded-lg border-overlay-foreground/15 bg-overlay-foreground/8 pl-12 text-lg text-overlay-foreground placeholder:text-overlay-foreground/40"
                            placeholder="Target location"
                            required
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={loading}
                        className="h-12 rounded-lg bg-accent px-8 text-md font-semibold text-accent-foreground hover:opacity-90"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Scanning...
                            </>
                        ) : (
                            <>
                                <Search className="mr-2 h-5 w-5" /> Execute search
                            </>
                        )}
                    </Button>
                    {searchError && (
                        <p className="mt-3 text-sm text-error">{searchError}</p>
                    )}
                </form>
            </div>

            {/* A completed search with zero matches is a real outcome, not
                a failure — give it its own quiet empty state instead of
                just rendering nothing where results would normally appear. */}
            {hasSearched && !loading && jobs.length === 0 && (
                <div className="border-t border-border pt-6 text-center">
                    <p className="text-sm text-text-secondary">No listings matched that search.</p>
                    <p className="mt-1 text-xs text-text-muted">
                        Try a broader role title or a nearby location.
                    </p>
                </div>
            )}

            {/* Results */}
            {jobs.length > 0 && (
                <div className="border-t border-border pt-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                            Active targets — {visibleJobs.length}
                        </p>
                        {savedCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowSavedOnly((prev) => !prev)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                    showSavedOnly
                                        ? "border-accent bg-accent-muted text-accent"
                                        : "border-border bg-surface text-text-secondary hover:bg-surface-secondary"
                                }`}
                            >
                                <Bookmark className={`h-3.5 w-3.5 ${showSavedOnly ? "fill-current" : ""}`} />
                                Saved only ({savedCount})
                            </button>
                        )}
                    </div>
                    {visibleJobs.length === 0 && (
                        <p className="text-sm text-text-muted">No saved jobs yet — save one from its detail page.</p>
                    )}
                    <div className="flex flex-col gap-4">
                        {visibleJobs.map((job, index) => (
                            <JobResultCard
                                key={job.id}
                                job={job}
                                index={index}
                                reappearanceSignal={reappearanceSignals[job.id] ?? null}
                            />
                        ))}
                    </div>

                    {lastRunAt && (
                        <div className="mt-6 flex items-center gap-2 font-mono text-xs text-text-muted">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" />
                            Last sortie · {lastRunLabel}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
