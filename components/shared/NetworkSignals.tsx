import { Sparkles, Users } from "lucide-react";

/**
 * The free half of "insider connections".
 *
 * JobRight's version claims a specific headcount ("3 former colleagues work
 * here") sourced from a paid people-search API. We don't have that data and
 * were never going to pay for it, so this only shows what's actually
 * knowable for free and true: whether the candidate's own work history
 * already includes this exact hiring company, plus a LinkedIn people-search
 * deep-link so they can go check for themselves. No invented numbers.
 *
 * Finding actual email addresses is the part that costs money (Hunter/Apollo)
 * and carries CASL/GDPR exposure — deliberately not done here.
 */

/**
 * LinkedIn's search page requires login and drops any query entirely for a
 * signed-out visitor — and its `keywords` param does a flat text match, so
 * jamming multiple company/school names into one query string (the earlier
 * version) doesn't do a real cross-referenced search, it just searches for
 * that whole jumbled phrase and reliably returns nothing useful. Search on
 * the hiring company alone instead — that's a real, working "who works
 * here" search; past employers/school are surfaced separately as hints
 * below, not baked into a query that can't actually use them.
 */
export function buildLinkedInPeopleSearchUrl(company: string): string {
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}`;
}

export type NetworkSignal = {
    /** The candidate's own past employer that matches this job's hiring company. */
    employer: string;
};

type Props = {
    company: string;
    /** Real fact from the candidate's own profile, or null if there's no match. */
    previousEmployer: NetworkSignal | null;
    /** Candidate's own past employers/school — shown as hints, not part of the search query. */
    searchTerms: string[];
};

export function NetworkSignals({ company, previousEmployer, searchTerms }: Props) {
    if (!previousEmployer && searchTerms.length === 0) return null;

    return (
        <section className="border border-border bg-surface shadow-card overflow-hidden rounded-2xl">
            <div className="flex items-center gap-3 border-b border-border p-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
                    <Users className="h-4 w-4 text-accent" />
                </div>
                <h2 className="text-base font-semibold leading-6 text-text-primary">
                    Insider Connection
                </h2>
            </div>

            <div className="flex flex-col gap-4 p-6">
                <p className="text-sm font-semibold leading-6 text-text-primary">
                    A warm intro beats a cold application.
                </p>

                {previousEmployer && (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success-lightest px-3 py-1 text-xs font-medium text-success-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        You worked at {previousEmployer.employer} before — same company as this listing
                    </span>
                )}

                {searchTerms.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span>Once you&apos;re on LinkedIn, look for people who also list:</span>
                        {searchTerms.map((term) => (
                            <span
                                key={term}
                                className="rounded-full bg-surface-secondary px-2.5 py-1 font-medium text-text-secondary"
                            >
                                {term}
                            </span>
                        ))}
                    </div>
                )}

                <a
                    href={buildLinkedInPeopleSearchUrl(company)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="btn-signal inline-flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground"
                >
                    Find people at {company} on LinkedIn
                </a>
            </div>
        </section>
    );
}
