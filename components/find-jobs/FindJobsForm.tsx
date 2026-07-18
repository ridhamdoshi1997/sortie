"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Search, MapPin, Briefcase, Loader2, Building2 } from "lucide-react";
import { scrapeAndEvaluateJobs, getJobsByIds } from "@/lib/actions/scraper.actions";
import Link from "next/link";

type Props = {
    userId: string;
    initialJobs?: any[];
};

function scoreTierClass(score: number) {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-info";
    return "text-warning";
}

export function FindJobsForm({ userId, initialJobs = [] }: Props) {
    const [title, setTitle] = useState("");
    const [location, setLocation] = useState("");
    const [loading, setLoading] = useState(false);
    const [jobs, setJobs] = useState<any[]>(initialJobs);
    // Only poll for jobs that haven't been scored yet — a page load with
    // already-scored history shouldn't start an indefinite refresh loop.
    const [jobIds, setJobIds] = useState<string[]>(
        initialJobs.filter((job) => job.match_score === null).map((job) => job.id)
    );

    const [filters, setFilters] = useState({
        visa_sponsorship: "",
        remote_policy: "",
    });

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
                        setJobs(updatedJobs);
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

        try {
            const savedJobs = await scrapeAndEvaluateJobs(title, location, filters, userId);
            setJobs(savedJobs ?? []);
            setJobIds((savedJobs ?? []).map((job: any) => job.id));
        } catch (error) {
            console.error("Pipeline failed:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto mt-0 w-full max-w-6xl space-y-8">
            {/* Mission console — dark ink chrome, matches the app-wide brand frame */}
            <div className="rounded-2xl border border-overlay bg-overlay p-8 shadow-card md:p-12">
                <div className="mb-8 max-w-2xl">
                    <h2 className="mb-3 flex items-center gap-2 text-3xl font-bold tracking-tight text-surface md:text-4xl">
                        <span className="text-accent">&#9670;</span>
                        Run a sortie
                    </h2>
                    <p className="text-lg text-surface/60">
                        Scan the field and score every result against your profile before you spend a click on it.
                    </p>
                </div>

                <div className="mb-6 grid w-full grid-cols-1 gap-4 md:grid-cols-2">
                    {Object.entries(filters).map(([key, value]) => (
                        <div key={key} className="flex flex-col gap-1">
                            <label className="font-mono text-xs font-semibold uppercase tracking-wider text-surface/50">
                                {key.replace("_", " ")}
                            </label>
                            <Input
                                value={value}
                                onChange={(e) => updateFilter(key, e.target.value)}
                                className="rounded-lg border-surface/15 bg-surface/8 text-surface placeholder:text-surface/40"
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
                    className="flex flex-col gap-4 rounded-xl border border-surface/10 bg-overlay-dark/50 p-4 shadow-inner backdrop-blur-md md:flex-row"
                >
                    <div className="relative flex-1">
                        <Briefcase className="absolute top-3.5 left-4 h-5 w-5 text-surface/40" />
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="h-12 rounded-lg border-surface/15 bg-surface/8 pl-12 text-lg text-surface placeholder:text-surface/40"
                            placeholder="Target role"
                            required
                        />
                    </div>
                    <div className="relative flex-1">
                        <MapPin className="absolute top-3.5 left-4 h-5 w-5 text-surface/40" />
                        <Input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="h-12 rounded-lg border-surface/15 bg-surface/8 pl-12 text-lg text-surface placeholder:text-surface/40"
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
            </div>

            {/* Results */}
            {jobs.length > 0 && (
                <div className="border-t border-border pt-6">
                    <h3 className="mb-6 flex items-center gap-2 text-xl font-semibold text-text-primary">
                        <Building2 className="h-5 w-5 text-text-muted" />
                        Targets acquired ({jobs.length})
                    </h3>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {jobs.map((job) => (
                            <Link href={`/find-jobs/${job.id}`} key={job.id}>
                                <Card className="flex cursor-pointer flex-col border-border bg-surface transition-all hover:border-accent hover:shadow-md">
                                    <CardHeader className="pb-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <CardTitle className="text-lg font-bold text-text-primary">
                                                {job.title}
                                            </CardTitle>
                                            {job.match_score !== undefined && job.match_score !== null && (
                                                <span
                                                    className={`shrink-0 font-mono text-lg font-semibold tabular-nums ${scoreTierClass(job.match_score)}`}
                                                >
                                                    {job.match_score}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-accent">{job.company}</p>
                                        <p className="mt-2 flex items-center gap-1 text-sm text-text-secondary">
                                            <MapPin className="h-4 w-4" /> {job.location || "Location N/A"}
                                        </p>
                                    </CardHeader>

                                    <CardContent className="pb-6">
                                        <p className="line-clamp-3 text-sm text-text-secondary">{job.description}</p>
                                    </CardContent>

                                    {/* Agent read — reserved teal treatment for AI-generated content,
                                        never used for anything else in the app */}
                                    {job.match_reason && (
                                        <CardFooter className="pt-0">
                                            <div className="w-full rounded-r-lg border-l-2 border-agent bg-agent-muted px-3 py-2">
                                                <p className="mb-1 font-mono text-[10px] font-semibold tracking-wide text-agent uppercase">
                                                    Agent read
                                                </p>
                                                <p className="line-clamp-2 text-xs text-agent-foreground">
                                                    {job.match_reason}
                                                </p>
                                            </div>
                                        </CardFooter>
                                    )}
                                </Card>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
