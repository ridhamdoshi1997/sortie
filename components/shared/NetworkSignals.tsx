import { ExternalLink, GraduationCap, Users } from "lucide-react";

/**
 * The free half of "insider connections".
 *
 * JobRight's version deep-links into LinkedIn's own people search with
 * pre-built company/school filters rather than scraping or paying a
 * people-data API. We do the same: match the candidate's own employers and
 * schools against the hiring company, then hand them a filtered LinkedIn
 * search. No scraping, no per-lookup cost, nothing stored about third parties.
 *
 * Finding actual email addresses is the part that costs money (Hunter/Apollo)
 * and carries CASL/GDPR exposure — deliberately not done here.
 */

/**
 * LinkedIn's filtered search needs its internal numeric company/school IDs,
 * which we don't have. Keyword search takes plain text and works without any
 * ID mapping, so that's what we build.
 */
export function buildLinkedInPeopleSearchUrl(terms: string[]): string {
    const keywords = terms.filter(Boolean).join(" ");
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

export type NetworkSignal = {
    kind: "colleague" | "alumni";
    /** How many overlapping people we believe are there. */
    count: number;
    /** The shared employer or school driving the overlap. */
    via: string;
};

type Props = {
    company: string;
    signals: NetworkSignal[];
};

export function NetworkSignals({ company, signals }: Props) {
    if (signals.length === 0) return null;

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-4">
            <div className="flex flex-wrap gap-2">
                {signals.map((signal) => {
                    const isAlumni = signal.kind === "alumni";
                    const Icon = isAlumni ? GraduationCap : Users;
                    return (
                        <span
                            key={`${signal.kind}-${signal.via}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 text-xs font-medium text-agent-dark"
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {signal.count} {isAlumni ? "school alumni" : "former colleagues"} work here
                            <span className="text-agent-dark/70">· via {signal.via}</span>
                        </span>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs leading-5 text-text-muted">
                    A warm intro beats a cold application. These are people who share an employer
                    or school with you.
                </p>
                <a
                    href={buildLinkedInPeopleSearchUrl([company, ...signals.map((s) => s.via)])}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-muted"
                >
                    Find them on LinkedIn
                    <ExternalLink className="h-3.5 w-3.5" />
                </a>
            </div>
        </div>
    );
}
