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
import { JobDetailDrawer } from "@/components/find-jobs/JobDetailDrawer";
import { LimitReachedModal, type LimitReachedReason } from "@/components/shared/LimitReachedModal";
import { FilterBar } from "@/components/find-jobs/FilterBar";
import { applyClientFilters, filtersToSearchParams, searchParamsToFilters } from "@/lib/jobFilters";
import type { ReappearanceSignal } from "@/lib/churnSignal";
import type { Job } from "@/types";

// How many of this search's jobs need to finish evaluating (scored,
// hidden or not — "finished" is what matters here, not "visible") before
// the results section reveals at all — see resultsRevealed's own comment.
const REVEAL_THRESHOLD = 10;

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
    // Job detail drawer / split view (build-plan.md §H) — fast browsing
    // without a full navigation. Find & Evaluate is deliberately the one
    // page this is wired into (job cards elsewhere — Missions, Career — are
    // in a tracking context, not a rapid-browsing one).
    const [drawerJob, setDrawerJob] = useState<Job | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [limitModal, setLimitModal] = useState<{ reason: LimitReachedReason; message: string; resetsAt?: string; canUpgrade?: boolean } | null>(null);
    // Distinguishes "haven't run a search this session yet" from "ran one,
    // got zero matches" — the latter needs its own empty state, not silence.
    const [hasSearched, setHasSearched] = useState(false);
    const [jobs, setJobs] = useState<Job[]>(initialJobs);
    // Direct user request (2026-09-01): don't show a wall of individually-
    // loading "Scoring…" cards the instant a search returns — hold the
    // whole results section behind one full loader until a real first
    // batch has actually finished evaluating, then reveal what's ready in
    // one clean switch. Defaults true so a page load with existing scored
    // history (the common case — returning to a past search) shows
    // immediately, with no artificial wait; runSearch() explicitly flips
    // it false for a genuinely fresh search that has real evaluation work
    // ahead of it.
    const [resultsRevealed, setResultsRevealed] = useState(true);
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

    // Real, documented Next.js 16 behavior, not a bug in this app's own
    // code (confirmed against node_modules/next/dist/docs/01-app/
    // 04-glossary.md's own Client Cache entry, 2026-09-01, after two prior
    // sessions treated this as unsolved): "Pages are not cached by default
    // but are reused during browser back/forward navigation" — pressing
    // Back always shows whatever this page rendered before the user left
    // it, regardless of staleTimes or any other cache-freshness config,
    // specifically to preserve scroll position. popstate fires reliably on
    // real back/forward navigation independent of whether this component
    // instance itself remounts (the whole point of the cache is that it
    // often doesn't), so it's the one signal that actually correlates with
    // this exact symptom — a mount-only effect isn't guaranteed to re-fire
    // here. router.refresh() re-executes this page's Server Component and
    // delivers a fresh `initialJobs` prop; the effect below is what
    // actually gets that fresh prop back into visible state, since
    // useState(initialJobs) only reads its initializer once and does not
    // react to later prop changes on its own.
    useEffect(() => {
        const handlePopState = () => router.refresh();
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [router]);

    // Adjusted during render, not in an effect — this project's own
    // react-hooks/set-state-in-effect rule (and React's own guidance:
    // https://react.dev/learn/you-might-not-need-an-effect) treats
    // "reset state when a prop changes" as a render-time concern, not an
    // effect: comparing against the last-seen prop and calling setState
    // synchronously here bails out before paint, avoiding the extra
    // commit+effect+re-render an Effect-based version would cost.
    const [lastInitialJobs, setLastInitialJobs] = useState(initialJobs);
    if (initialJobs !== lastInitialJobs) {
        setLastInitialJobs(initialJobs);
        setJobs(initialJobs);
        setJobIds(initialJobs.filter((job) => job.match_score === null).map((job) => job.id));
    }

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
                        //
                        // Real gap found live (2026-09-01, direct user
                        // question: "if it's hiding jobs in the background,
                        // how do I see that live?") — this merge updated a
                        // polled job's fields (score, reasoning, etc.) but
                        // never checked is_hidden, so a job the evaluator's
                        // genuine-link gate hid mid-poll stayed fully
                        // visible in the list until the next full page
                        // load. Filtering it out here is what actually
                        // makes a job disappear live, not just on refresh.
                        setJobs((prev) =>
                            prev
                                .map((job) => updatedJobs.find((updated) => updated.id === job.id) ?? job)
                                .filter((job) => !job.is_hidden)
                        );

                        // Reveal the results section once a real first
                        // batch has finished (direct user request,
                        // 2026-09-01) — "finished" means scored at all,
                        // hidden or not, not "visible": waiting for 10
                        // VISIBLE jobs specifically could mean waiting for
                        // nearly the whole batch on a search where most
                        // jobs end up hidden by the authenticity gate,
                        // defeating the point of an early reveal. Once
                        // already true, never flips back — a later hide
                        // shouldn't re-trigger the loader.
                        setResultsRevealed((prevRevealed) => {
                            if (prevRevealed) return true;
                            const finishedCount = updatedJobs.filter((job) => job.match_score !== null).length;
                            return finishedCount >= Math.min(REVEAL_THRESHOLD, jobIds.length) || finishedCount === jobIds.length;
                        });

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
            const result = await scrapeAndEvaluateJobs(title, location, evaluatorFilters, userId);
            if (Array.isArray(result)) {
                const unscored = result.filter((job) => job.match_score === null);
                setJobs(result);
                setJobIds(unscored.map((job) => job.id));
                setHasSearched(true);
                setLastSearchedDatePosted(searchFilters.datePosted);
                // Nothing left to wait for — either zero results, or a
                // repeat search where everything found was already scored
                // — reveal right away rather than sit behind a loader for
                // work that isn't happening.
                setResultsRevealed(unscored.length === 0);
            } else {
                // reason is only ever populated for the real daily-cap-reached
                // case — a kill-switch/suspension block has no reason and
                // isn't an "upgrade" story, so it stays the plain inline
                // error text below instead of the polished modal.
                if (result.reason) {
                    setLimitModal({ reason: result.reason, message: result.error, resetsAt: result.resetsAt, canUpgrade: result.canUpgrade });
                } else {
                    setSearchError(result.error);
                }
            }
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
    // Aggregate scoring progress (direct user report: a big search showed a
    // wall of individually-pulsing "Scoring…" cards with no sense of overall
    // progress — reads as stuck even while genuinely working through a real,
    // multi-minute AI evaluation queue). jobIds is the fixed watch-list set
    // by runSearch for THIS search; counting how many of those specific ids
    // already have a match_score gives real progress, not a guess.
    const scoringWatchSet = useMemo(() => new Set(jobIds), [jobIds]);
    const totalScoring = jobIds.length;
    const stillScoringCount = jobs.filter((job) => scoringWatchSet.has(job.id) && job.match_score === null).length;
    const scoredSoFar = totalScoring - stillScoringCount;
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
            {/* Mission console. Compacted 2026-08-25: this card's own hero
                (3xl/4xl heading + subtitle + p-8/p-12 padding) was the
                other half of the "search box below the fold" problem — the
                page-level header removed in app/find-jobs/page.tsx said the
                same thing this heading does. Kept the identity (the
                diamond mark, "Run a sortie") as one compact inline row
                instead of dropping it outright, since it's this page's
                real brand voice, not filler.

                Decoupled from the `overlay` tokens entirely (2026-08-25,
                direct user request) — this card used to share Navbar's
                fixed-dark-in-both-themes chrome, so it stayed a near-black
                console in light mode while every surface around it went
                light. The Navbar keeps that fixed-dark treatment on
                purpose (explicit user call, same session) — only this
                card's identity was ever meant to track the page theme,
                since it's a normal content card, not permanent app chrome.
                Now plain surface/text tokens, same as every other card,
                so it lights up correctly with the rest of the page.
                FilterBar.tsx's pills below share this same card visually
                and were swapped the same way — see that file. */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card md:p-6">
                <div className="mb-4 flex items-baseline gap-2">
                    <h2 className="font-display fade-in-up flex items-center gap-2 text-xl font-bold tracking-tight text-text-primary">
                        <span className="text-accent">&#9670;</span>
                        Run a sortie
                    </h2>
                    <p className="truncate text-sm text-text-muted">
                        Scan the field and score every result against your profile first.
                    </p>
                </div>

                <form
                    onSubmit={handleSearch}
                    className="flex flex-col gap-4 rounded-xl border border-border bg-surface-secondary p-4 shadow-inner md:flex-row"
                >
                    <div className="relative flex-1">
                        <Briefcase className="absolute top-3.5 left-4 h-5 w-5 text-text-muted" />
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="h-12 rounded-lg border-border bg-surface pl-12 text-lg text-text-primary placeholder:text-text-muted"
                            placeholder="Target role"
                            required
                        />
                    </div>
                    <div className="relative flex-1">
                        <MapPin className="absolute top-3.5 left-4 h-5 w-5 text-text-muted" />
                        <Input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="h-12 rounded-lg border-border bg-surface pl-12 text-lg text-text-primary placeholder:text-text-muted"
                            placeholder="Target location"
                            required
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={loading}
                        className="btn-signal h-12 rounded-lg px-8 text-md font-semibold text-accent-foreground"
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
                {limitModal && (
                    <LimitReachedModal
                        reason={limitModal.reason}
                        featureLabel="job searches"
                        message={limitModal.message}
                        resetsAt={limitModal.resetsAt}
                        canUpgrade={limitModal.canUpgrade}
                        onClose={() => setLimitModal(null)}
                    />
                )}

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

            {/* Full-section loader (direct user request, 2026-09-01) — a
                fresh search's results stay behind this instead of showing
                a wall of individually-"Scoring…" cards the instant the
                page has raw, unevaluated jobs. Swaps to the real list in
                one clean switch once a real first batch has finished
                (resultsRevealed's own comment has the exact threshold). */}
            {jobs.length > 0 && !resultsRevealed && (
                <div className="border-t border-border pt-10 pb-6 flex flex-col items-center gap-3 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-agent" />
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                        Scanning the field — {scoredSoFar} of {totalScoring} evaluated
                    </p>
                    <p className="text-xs text-text-muted">
                        Checking each listing&apos;s legitimacy and apply link before showing results.
                    </p>
                </div>
            )}

            {/* Results */}
            {jobs.length > 0 && resultsRevealed && (
                <div className="border-t border-border pt-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                                Active targets — {visibleJobs.length}
                                {visibleJobs.length !== jobs.length && ` of ${jobs.length}`}
                            </p>
                            {stillScoringCount > 0 && (
                                <p className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-text-secondary">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-agent" />
                                    Scoring {scoredSoFar} of {totalScoring}…
                                </p>
                            )}
                        </div>
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
                                onQuickView={() => setDrawerJob(job)}
                            />
                        ))}
                    </div>

                    <JobDetailDrawer job={drawerJob} onClose={() => setDrawerJob(null)} />

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
