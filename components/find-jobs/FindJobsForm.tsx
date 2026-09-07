"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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

// Survives client-side navigation, and ONLY that (2026-09-05).
//
// Making the page empty by default broke going back: leaving for a job's
// detail page unmounts this component, so its state is gone, and the server
// now deliberately returns no jobs — so Back landed on an empty list. The
// earlier guard against an empty server list clobbering on-screen results does
// not help, because by then there are no on-screen results left to protect.
//
// A module-level variable is exactly the right lifetime here, and sessionStorage
// is not: this is wiped by any real document load (hard refresh, a new tab,
// opening the URL directly), which must stay empty, but it survives Next's
// client-side router navigations, which is precisely the Back case. No
// navigation-type sniffing needed — the distinction falls out of where the
// value lives.
let lastResultsCache: { userId: string; jobs: Job[]; jobIds: string[] } | null = null;

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
    // Separate from `loading` on purpose (2026-09-05, direct user requirement:
    // "results within a second, or a loader for 2 to 3 seconds, that's it").
    // `loading` now means only "the blocking loader is on screen", and ends
    // the moment there is something real to show. `searchInFlight` means "the
    // server action has not resolved yet" and is what keeps the result poll
    // running and the Search button disabled, so results can keep streaming in
    // for the ~50s the paid providers take without the user staring at a
    // spinner for it.
    const [searchInFlight, setSearchInFlight] = useState(false);
    // Bumped on each search to (re)start the result poll. The poll's lifetime
    // is deliberately independent of the request's — see its own comment.
    const [pollGeneration, setPollGeneration] = useState(0);
    // Which sources have returned so far, for the progress line during a search.
    const [landedSources, setLandedSources] = useState<string[]>([]);
    // Tracked on a ref so a second search cancels the previous run's loader
    // timer instead of letting it fire mid-way through the new one.
    const loaderTimerRef = useRef<NodeJS.Timeout | null>(null);
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
    const [jobs, setJobs] = useState<Job[]>(() => {
        if (initialJobs.length > 0) return initialJobs;
        return lastResultsCache?.userId === userId ? lastResultsCache.jobs : [];
    });
    // Only poll for jobs that haven't been scored yet — a page load with
    // already-scored history shouldn't start an indefinite refresh loop.
    const [jobIds, setJobIds] = useState<string[]>(() => {
        if (initialJobs.length > 0) return initialJobs.filter((job) => job.match_score === null).map((job) => job.id);
        return lastResultsCache?.userId === userId ? lastResultsCache.jobIds : [];
    });
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

    // Mirrors the visible list into the module cache so a later mount (Back
    // from a job's detail page) can restore it. Writing to an external store,
    // not setState, so this cannot loop.
    useEffect(() => {
        lastResultsCache = { userId, jobs, jobIds };
    }, [userId, jobs, jobIds]);

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
        // An EMPTY server list never clobbers results already on screen
        // (2026-09-05). The page is now empty by default, which means the
        // popstate -> router.refresh() path — the thing that exists so
        // pressing Back from a job's detail page shows fresh data — started
        // handing back [] and wiping the very results the user was coming
        // back to. Coming back from a job must show the same list you left;
        // a fresh visit starts empty because this component mounts with an
        // empty initialJobs, not because an empty prop arrives later.
        if (initialJobs.length > 0 || jobs.length === 0) {
            setJobs(initialJobs);
            setJobIds(initialJobs.filter((job) => job.match_score === null).map((job) => job.id));
        }
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
        const next = query ? `?${query}` : "?";
        // Skip the navigation when the URL already says this (2026-09-05).
        // This effect runs on mount too, and searchFilters is initialised FROM
        // the URL, so the first run always replaced the URL with what it
        // already was — a real router navigation for no change. Every
        // navigation to this route can surface app/find-jobs/loading.tsx,
        // which is a full-page skeleton, so a no-op navigation is not free:
        // it can blank the page the user is already looking at.
        const current = window.location.search || "?";
        if (current === next) return;
        router.replace(next, { scroll: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchFilters]);
    const [showSavedOnly, setShowSavedOnly] = useState(false);

    // 3s per tick, so 200 ticks is 10 minutes. See the give-up branch in the
    // polling effect below for why an absolute ceiling is needed at all.
    const MAX_SCORE_POLL_TICKS = 200;

    // 1s per tick. 90 consecutive ticks with no new job means the search has
    // stopped producing — comfortably longer than the ~40s gap between Indeed
    // landing and LinkedIn landing.
    const POLL_IDLE_TICKS_BEFORE_STOP = 90;

    // --- AUTO-REFRESH POLLING LOGIC ---
    // Polls by the exact set of job ids this search returned, not by
    // re-matching title/location text — a text re-match silently drops
    // results whose title or location is phrased differently than the
    // search box (e.g. "Software Engineer" vs "Software Developer", or
    // "Markham, ON" vs "Toronto, ON").
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (jobIds.length > 0) {
            let ticks = 0;
            interval = setInterval(async () => {
                try {
                    ticks += 1;
                    const updatedJobs = await getJobsByIds(jobIds);

                    // Nothing left to watch — every polled job was deleted
                    // or is no longer readable. Found live 2026-09-05 in the
                    // dev server log: after this account's search data was
                    // cleared, an open tab kept requesting the same 40 dead
                    // ids every 3s indefinitely, because the only exit below
                    // sits INSIDE the `length > 0` branch and an empty
                    // response could never reach it.
                    if (!updatedJobs || updatedJobs.length === 0) {
                        clearInterval(interval);
                        return;
                    }

                    {
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

                        // Stop polling once every job we're watching has a score.
                        if (updatedJobs.every((job) => job.match_score !== null)) {
                            clearInterval(interval);
                            return;
                        }

                        // Absolute ceiling, because "every job eventually
                        // gets a score" is NOT guaranteed and the exit above
                        // silently assumes it. Two real ways a job stays
                        // unscored forever: the evaluation quota runs out
                        // mid-search (evaluateWithinQuota saves those jobs
                        // and deliberately leaves them unevaluated until the
                        // cap resets), and the Inngest dev server not running
                        // at all — the documented local gotcha, and confirmed
                        // as the cause this session. In both cases this
                        // interval used to poll every 3s for the life of the
                        // tab. Ten minutes is far past any real evaluation
                        // (one throttle window is 60s) while still ending.
                        if (ticks >= MAX_SCORE_POLL_TICKS) {
                            console.warn(
                                `[FindJobsForm] giving up score polling after ${ticks} ticks — ` +
                                `${updatedJobs.filter((job) => job.match_score === null).length} job(s) still unscored. ` +
                                `Evaluation quota exhausted, or the Inngest worker isn't running.`,
                            );
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

    // Cache-first serving (2026-09-04). A search's wall-clock time is
    // dominated by the ~43s LinkedIn actor, but our own proactive-crawl
    // cache (637k postings) answers in about a second and is written
    // against the run before the providers are even called. This polls for
    // those rows while scrapeAndEvaluateJobs is still running, so results
    // appear seconds in instead of at the end.
    //
    // Additive only — it never removes a job. The authoritative set is
    // whatever the action itself returns; runSearch replaces the list
    // wholesale when its promise resolves, and anything on screen that the
    // full pass rejected (relevance trim, pre-filter) goes away then.
    // Merging rather than replacing also means the previous search's
    // results stay put until real new ones arrive, which is the behavior
    // this list already had while loading.
    useEffect(() => {
        if (pollGeneration === 0) return;

        let cancelled = false;
        let ticksWithoutNewJobs = 0;

        const tick = async () => {
            try {
                // fetch() to a route handler, NOT the getInFlightSearchJobs
                // Server Action this used to call. Next.js runs a client's
                // Server Actions one at a time, so every poll queued behind
                // the ~50s search action and only ran after it had finished —
                // which is why results appeared all at once at the end no
                // matter how early they were written to the database.
                const response = await fetch("/api/search-progress", { cache: "no-store" });
                if (!response.ok) return;
                const payload = (await response.json()) as { jobs: Job[]; sources?: string[] };
                const partial = payload.jobs ?? [];
                if (payload.sources) setLandedSources(payload.sources);
                if (cancelled || partial.length === 0) return;

                // First real results are on screen — take the blocking loader
                // down now rather than at the end of the whole pipeline. The
                // poll keeps running (searchInFlight, not loading) so the
                // provider results still stream in behind these.
                setLoading(false);

                setJobs((prev) => {
                    const byId = new Map(prev.map((job) => [job.id, job]));
                    let added = false;
                    for (const job of partial) {
                        if (!byId.has(job.id)) {
                            byId.set(job.id, job);
                            added = true;
                        }
                    }
                    // Returning prev unchanged when nothing is new keeps
                    // this from re-rendering the whole list every 2.5s
                    // while the providers are still working.
                    if (added) ticksWithoutNewJobs = 0;
                    return added ? Array.from(byId.values()) : prev;
                });
                setHasSearched(true);
            } catch (error) {
                // A failed poll is not a failed search — the action's own
                // result is still coming. Never surface this to the user.
                console.error("Cache-first poll failed:", error);
            }
        };

        // Fire immediately, THEN on an interval. setInterval alone waits a
        // full period before its first call, which put a hard floor under
        // time-to-first-result equal to the poll period — the exact thing
        // this poll exists to shorten. 1s after that: the cache upsert lands
        // ~1-2s in, so a shorter period only adds round-trips that find
        // nothing.
        void tick();
        const interval = setInterval(() => {
            // Deliberately NOT tied to the server action finishing
            // (2026-09-05). It used to stop the moment scrapeAndEvaluateJobs
            // resolved, which meant the list could only grow while the user
            // was still being made to wait — the exact opposite of "add jobs
            // as they come". Now the request and the arrival of results are
            // independent: jobs keep landing whether or not the action has
            // returned.
            //
            // Ends on its own once nothing new has arrived for a while, so an
            // idle tab is not polling forever — the failure mode already found
            // once in this file's score poll.
            ticksWithoutNewJobs += 1;
            if (ticksWithoutNewJobs > POLL_IDLE_TICKS_BEFORE_STOP) {
                clearInterval(interval);
                return;
            }
            void tick();
        }, 1000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [pollGeneration, userId]);

    const runSearch = async () => {
        if (loaderTimerRef.current) clearTimeout(loaderTimerRef.current);
        setLoading(true);
        setSearchInFlight(true);
        setSearchError(null);

        // Clear the previous search's results NOW, not when the new ones
        // arrive (2026-09-05). This is why a search read as "nothing is
        // happening" even after results started streaming in at ~1-2s: the
        // old list stayed on screen for the whole run, new jobs were merged
        // into the middle of it, and the only visible change was the whole
        // list being replaced when the server action finally resolved ~60s
        // later. So every improvement to time-to-first-result was invisible.
        // An empty list plus a loader is the honest picture of "we are
        // searching", and it makes arriving jobs actually legible as arrivals.
        setJobs([]);
        setJobIds([]);
        setPollGeneration((n) => n + 1);
        setLandedSources([]);

        // The blocking loader is capped at 2s, full stop (2026-09-05, direct
        // user requirement, stated three times: "the loader takes 1 to 2
        // seconds and then you can populate the jobs as they come").
        //
        // Every previous attempt tied the loader to some piece of real work
        // finishing — the whole action, then the first cache hit — and each
        // time the honest answer was "that takes 15 to 50 seconds", so the
        // loader ran that long. The requirement is not about when work
        // finishes. It is that a candidate should never sit in front of a
        // spinner: show the results surface quickly, then fill it. The search
        // keeps running, the poll keeps adding jobs, and the button reports
        // progress — none of which needs a spinner covering the page.
        const loaderTimer = setTimeout(() => setLoading(false), 2000);
        loaderTimerRef.current = loaderTimer;

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
                // Phase 1 of the 3-phase redesign (2026-09-01) —
                // scrapeAndEvaluateJobs now resolves/verifies every job's
                // apply link synchronously before this promise ever
                // resolves, so by the time `result` is in hand every job
                // already has a genuine link (or was hidden and excluded
                // entirely). There's no reason to hold the list behind a
                // loader waiting for AI scores anymore — Phase 2's lite
                // pass streams scores in progressively via the polling
                // below, same as any other still-loading field.
                const unscored = result.filter((job) => job.match_score === null);
                setJobs(result);
                setJobIds(unscored.map((job) => job.id));
                setHasSearched(true);
                setLastSearchedDatePosted(searchFilters.datePosted);
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
            setSearchInFlight(false);
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
                        disabled={searchInFlight}
                        className="btn-signal h-12 rounded-lg px-8 text-md font-semibold text-accent-foreground"
                    >
                        {searchInFlight ? (
                            <>
                                {/* Reports what has actually arrived rather
                                    than a bare spinner. A search keeps running
                                    ~50s because the LinkedIn actor does, and an
                                    unqualified "Scanning..." for that long
                                    reads as "nothing is ready" even while jobs
                                    are already on screen below. */}
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                {jobs.length > 0 ? `Scanning — ${jobs.length} found` : "Scanning..."}
                            </>
                        ) : (
                            <>
                                <Search className="mr-2 h-5 w-5" /> Execute search
                            </>
                        )}
                    </Button>
                </form>
                {searchError && <p className="mt-3 text-sm text-error">{searchError}</p>}
                {/* Results now appear as soon as our own cache answers (~1s),
                    while the paid providers keep running for ~50s behind them.
                    Without this line that reads as "the search finished and
                    found only these" — the honest version says more is coming
                    rather than leaving a silently-growing list unexplained. */}
                {searchInFlight && !loading && (
                    <p className="mt-3 flex items-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        {jobs.length > 0 ? `${jobs.length} found so far` : "Searching"}
                        {landedSources.length > 0 && ` · ${landedSources.join(", ")} done`}
                        {" · still searching…"}
                    </p>
                )}
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
            {/* !searchInFlight matters now that the loader is capped at 2s:
                without it, "No listings matched that search" appears two
                seconds into every search and stays until the first jobs
                arrive ~13s later — telling the user the search failed while
                it is still running. */}
            {hasSearched && !loading && !searchInFlight && jobs.length === 0 && (
                <div className="border-t border-border pt-6 text-center">
                    <p className="text-sm text-text-secondary">No listings matched that search.</p>
                    <p className="mt-1 text-xs text-text-muted">
                        Try a broader role title or a nearby location.
                    </p>
                </div>
            )}

            {/* Results — every visible job's apply link is already
                verified by the time it's on screen (Phase 1 of the
                3-phase redesign, 2026-09-01, runs synchronously inside
                scrapeAndEvaluateJobs before this list is ever set). Match
                scores stream in progressively via the polling above — see
                stillScoringCount/JobResultCard's own "Scoring…" state for
                that, not a whole-section loader. */}
            {jobs.length > 0 && (
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
