"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bookmark, Search, MapPin, Briefcase, Loader2 } from "lucide-react";
import { scrapeAndEvaluateJobs, getJobsByIds } from "@/lib/actions/scraper.actions";
import { formatTimeAgo } from "@/lib/utils";
import { toUserMessage } from "@/lib/errors";
import { JobResultCard } from "@/components/shared/JobResultCard";
import { FilterBar } from "@/components/find-jobs/FilterBar";
import { applyClientFilters, filtersToSearchParams, searchParamsToFilters } from "@/lib/jobFilters";
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

    const router = useRouter();
    const urlSearchParams = useSearchParams();
    // Initialized once from the URL on mount (shareable/bookmarkable filtered
    // searches, per agy's competitor research) — not kept in sync with
    // urlSearchParams afterward, since the effect below is the one writing
    // to the URL from here, not the other way around.
    const [searchFilters, setSearchFilters] = useState(() => searchParamsToFilters(urlSearchParams));
    // Date Posted is the one filter that can't be applied to already-fetched
    // results — it narrows the SerpApi query itself (lib/jobScraper.ts's
    // `chips` param), so changing it only takes effect on the NEXT search.
    // Tracked separately from searchFilters.datePosted so a real, visible
    // prompt can appear instead of the change silently doing nothing —
    // caught live: a real user picked a Date Posted option and the list
    // didn't move, with no indication why.
    const [lastSearchedDatePosted, setLastSearchedDatePosted] = useState(searchFilters.datePosted);
    useEffect(() => {
        const params = filtersToSearchParams(searchFilters);
        const query = params.toString();
        router.replace(query ? `?${query}` : "?", { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchFilters]);
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

    const runSearch = async () => {
        setLoading(true);
        setSearchError(null);

        // The AI evaluator still gets visa/remote as free-text context (score
        // nuance on jobs that already pass the hard filter below) — same
        // signal the old loose text boxes provided, now derived from the
        // structured filter state instead of typed separately. date_posted
        // goes to SerpApi itself (lib/jobScraper.ts), not the evaluator.
        const evaluatorFilters: Record<string, string> = {
            visa_sponsorship: searchFilters.visaSponsorshipOnly
                ? "Only consider jobs that explicitly offer or are open to visa sponsorship (H1B, TN, sponsorship, OPT/CPT, etc.)."
                : "",
            remote_policy: searchFilters.remotePolicy.length > 0
                ? `Candidate is looking for one of: ${searchFilters.remotePolicy.join(", ")}.`
                : "",
        };
        if (searchFilters.datePosted !== "any") evaluatorFilters.date_posted = searchFilters.datePosted;

        try {
            const savedJobs = await scrapeAndEvaluateJobs(title, location, evaluatorFilters, userId);
            setJobs(savedJobs ?? []);
            setJobIds((savedJobs ?? []).map((job) => job.id));
            setHasSearched(true);
            setLastSearchedDatePosted(searchFilters.datePosted);
        } catch (error) {
            console.error("Pipeline failed:", error);
            setSearchError(toUserMessage(error, "Search failed. Please try again."));
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        void runSearch();
    };

    // Date Posted is the one filter that costs a real paid SerpApi call
    // (every other filter here just re-filters jobs already on screen, for
    // free) — auto-firing it on every click would silently spend a call per
    // option while someone's still deciding between "Past week"/"Past
    // month". Debounced so only the value the user settles on triggers a
    // real search, not every intermediate click. Only fires once a search
    // has already run this session (jobs.length > 0) and only when the
    // value actually changed from what produced the results on screen.
    useEffect(() => {
        if (jobs.length === 0) return;
        if (searchFilters.datePosted === lastSearchedDatePosted) return;
        const timer = setTimeout(() => {
            void runSearch();
        }, 700);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchFilters.datePosted]);

    const savedCount = jobs.filter((job) => job.is_saved).length;
    const filteredJobs = useMemo(() => applyClientFilters(jobs, searchFilters), [jobs, searchFilters]);
    const visibleJobs = showSavedOnly ? filteredJobs.filter((job) => job.is_saved) : filteredJobs;
    // Gated on real jobs being on screen, not on hasSearched — jobs loaded
    // from the server on initial page load (the common case, no client-side
    // search run yet this session) never flip hasSearched, so that gate
    // silently hid this prompt even though results were visible (user-caught
    // live: picked a Date Posted option, saw no prompt, no change).
    const datePostedNeedsNewSearch = jobs.length > 0 && searchFilters.datePosted !== lastSearchedDatePosted;

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
                </form>
                {searchError && <p className="mt-3 text-sm text-error">{searchError}</p>}

                <div className="mt-5">
                    <FilterBar filters={searchFilters} onChange={setSearchFilters} />
                </div>

                {/* Date Posted narrows the SerpApi query itself, so it can't
                    re-filter results already on screen — every other filter
                    here does. It auto-fires a real search ~700ms after the
                    user settles on an option (debounced in the effect above,
                    so clicking through several options only spends one real
                    call) — this is just a visible status while that's
                    in flight, not an action the user has to take. */}
                {datePostedNeedsNewSearch && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-muted px-4 py-2.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                        <p className="text-xs text-accent">
                            {loading ? "Applying the new date filter…" : "Date posted changed — applying shortly…"}
                        </p>
                    </div>
                )}
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
                            {visibleJobs.length !== jobs.length && ` of ${jobs.length}`}
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
                    {visibleJobs.length === 0 && showSavedOnly && (
                        <p className="text-sm text-text-muted">No saved jobs yet — save one from its detail page.</p>
                    )}
                    {visibleJobs.length === 0 && !showSavedOnly && (
                        <p className="text-sm text-text-muted">No jobs match the current filters — try clearing one or two.</p>
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
