import Link from "next/link";
import { Users } from "lucide-react";

import { EmailLookupButton } from "@/components/job-details/EmailLookupButton";
import { InsiderConnectionsButton } from "@/components/job-details/InsiderConnectionsButton";
import { LinkedInGlyph } from "@/components/shared/LinkedInGlyph";
import type { ConnectionPerson, InsiderConnections as InsiderConnectionsData } from "@/types";

type Props = {
  jobId: string;
  company: string;
  connections: InsiderConnectionsData | null | undefined;
  lookedUp: boolean | undefined;
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PersonRow({
  person,
  companyLinkedinUrl,
}: {
  person: ConnectionPerson;
  companyLinkedinUrl?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">
        {getInitials(person.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-5 text-text-primary">
          {person.name}
        </p>
        <p className="truncate text-xs leading-4 text-text-muted">{person.title}</p>
        {person.pastEmployer && (
          <p className="truncate text-xs leading-4 text-accent">
            Previously@{person.pastEmployer}
          </p>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {companyLinkedinUrl && (
          <EmailLookupButton
            firstName={person.firstName}
            lastName={person.lastName}
            companyLinkedinUrl={companyLinkedinUrl}
          />
        )}
        {person.linkedinUrl && (
          <Link
            href={person.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            title="View on LinkedIn"
            aria-label={`${person.name} on LinkedIn`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            <LinkedInGlyph className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

function Bucket({
  title,
  headerClassName,
  people,
  companyLinkedinUrl,
}: {
  title: string;
  headerClassName: string;
  people: ConnectionPerson[];
  companyLinkedinUrl?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-xl border border-border bg-surface-secondary p-3">
      <span
        className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${headerClassName}`}
      >
        {title}
      </span>
      {people.length > 0 ? (
        <div className="flex flex-col gap-2">
          {people.map((person) => (
            <PersonRow
              key={`${person.name}-${person.title}`}
              person={person}
              companyLinkedinUrl={companyLinkedinUrl}
            />
          ))}
        </div>
      ) : (
        <p className="px-1 py-2 text-xs text-text-muted">No matches found here.</p>
      )}
    </div>
  );
}

export function InsiderConnections({ jobId, company, connections, lookedUp }: Props) {
  const hasAny =
    (connections?.beyondNetwork.length ?? 0) > 0 ||
    (connections?.previousCompany.length ?? 0) > 0 ||
    (connections?.school.length ?? 0) > 0;

  return (
    <section className="border border-border bg-surface shadow-card overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
            <Users className="h-4 w-4 text-accent" />
          </div>
          <h2 className="text-base font-semibold leading-6 text-text-primary">
            Insider Connection @{company}
          </h2>
        </div>
        {!lookedUp && <InsiderConnectionsButton jobId={jobId} />}
      </div>

      <div className="p-6">
        {hasAny && connections ? (
          <div className="flex flex-col gap-4 md:flex-row">
            <Bucket
              title="Beyond Your Network"
              headerClassName="bg-success-lightest text-success-foreground"
              people={connections.beyondNetwork}
              companyLinkedinUrl={connections.companyLinkedinUrl}
            />
            <Bucket
              title="From Your Previous Company"
              headerClassName="bg-info-lightest text-info"
              people={connections.previousCompany}
              companyLinkedinUrl={connections.companyLinkedinUrl}
            />
            <Bucket
              title="From Your School"
              headerClassName="bg-accent-muted text-accent"
              people={connections.school}
              companyLinkedinUrl={connections.companyLinkedinUrl}
            />
          </div>
        ) : lookedUp ? (
          <p className="text-sm text-text-muted">
            Searched, but no public connections were found at {company}.
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            Discover people who might provide insights and potential referrals — real LinkedIn
            profiles, not invented data.
          </p>
        )}
      </div>
    </section>
  );
}
