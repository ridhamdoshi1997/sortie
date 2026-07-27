import Link from "next/link";
import type { ComponentType } from "react";
import {
  Building2,
  CircleHelp,
  Code2,
  Compass,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { AutoResearchCompany } from "@/components/job-details/AutoResearchCompany";
import { LeadershipTeamButton } from "@/components/job-details/LeadershipTeamButton";
import { LinkedInGlyph } from "@/components/shared/LinkedInGlyph";
import type { CompanyLeader, CompanyResearchDossier } from "@/types";

type Props = {
  company: string;
  jobId: string;
  research: CompanyResearchDossier | null;
};

type SectionProps = {
  title: string;
  items: string[];
  icon: ComponentType<{ className?: string }>;
  variant?: "accent" | "success" | "info";
};

function getIconClasses(variant: SectionProps["variant"]): string {
  if (variant === "success") {
    return "bg-success-lightest text-success";
  }

  if (variant === "info") {
    return "bg-info-lightest text-info-medium";
  }

  return "bg-accent-muted text-accent";
}

function ResearchList({ title, items, icon: Icon, variant }: SectionProps) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4">
      <div className="mb-3 flex items-center gap-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${getIconClasses(variant)}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold leading-5 text-text-primary">
          {title}
        </h3>
      </div>
      <ul className="space-y-2 text-sm font-medium leading-6 text-text-primary">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TechStack({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold leading-5 text-text-primary">
        Tech Stack
      </h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent"
          >
            <Code2 className="h-3 w-3" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function Sources({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="border-t border-border px-6 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        Sources
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sources.map((source) => (
          <Link
            key={source}
            href={source}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            {source}
          </Link>
        ))}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// JobRight's own leadership section is photo-card-per-person with a
// LinkedIn icon overlaid in the corner of the photo, not a table row
// (build-plan.md §H1). Real photos only ever come from the paid Apify
// path — Wikipedia/site-guess sources fall back to an initials avatar.
function LeaderCard({ leader }: { leader: CompanyLeader }) {
  const card = (
    <div className="flex flex-col items-center rounded-xl border border-border bg-surface-secondary p-4 text-center">
      <div className="relative">
        {leader.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable host (LinkedIn CDN); no fixed domain to allowlist for next/image
          <img
            src={leader.photoUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-muted text-lg font-semibold text-accent">
            {getInitials(leader.name)}
          </div>
        )}
        {leader.linkedinUrl && (
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface-secondary bg-accent text-accent-foreground">
            <LinkedInGlyph className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <p className="mt-3 text-sm font-semibold leading-5 text-text-primary">
        {leader.name}
      </p>
      <p className="mt-1 text-xs leading-4 text-text-muted">{leader.title}</p>
    </div>
  );

  if (!leader.linkedinUrl) return card;

  return (
    <Link
      href={leader.linkedinUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`${leader.name} on LinkedIn`}
      className="transition-opacity hover:opacity-90"
    >
      {card}
    </Link>
  );
}

export function CompanyResearch({ company, jobId, research }: Props) {
  return (
    <section className="glass-panel overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-border p-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted">
          <Building2 className="h-4 w-4 text-accent" />
        </div>
        <h2 className="text-base font-semibold leading-6 text-text-primary">
          Company Research
        </h2>
      </div>

      {research ? (
        <>
          <div className="flex flex-col gap-6 p-6">
            <div className="rounded-xl border border-border bg-surface-secondary p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-muted text-accent">
                  <Compass className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold leading-5 text-text-primary">
                  Company Overview
                </h3>
              </div>
              <p className="text-sm font-medium leading-6 text-text-primary">
                {research.companyOverview}
              </p>
              {research.industryTags && research.industryTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {research.industryTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-secondary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <TechStack items={research.techStack} />

            <div className="grid gap-4 md:grid-cols-2">
              <ResearchList
                title="Culture"
                items={research.culture}
                icon={Users}
                variant="info"
              />
              <ResearchList
                title="Your Edge"
                items={research.yourEdge}
                icon={ShieldCheck}
                variant="success"
              />
              <ResearchList
                title="Gaps to Address"
                items={research.gapsToAddress}
                icon={ListChecks}
              />
              <ResearchList
                title="Smart Questions"
                items={research.smartQuestions}
                icon={CircleHelp}
                variant="info"
              />
              <ResearchList
                title="Interview Prep"
                items={research.interviewPrep}
                icon={MessageSquareText}
                variant="success"
              />
              <ResearchList
                title="Recent Updates"
                items={research.recentUpdates ?? []}
                icon={Newspaper}
                variant="info"
              />
            </div>

            <div className="rounded-xl border border-border bg-surface-secondary p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success-lightest text-success">
                  <Lightbulb className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold leading-5 text-text-primary">
                  Why This Role
                </h3>
              </div>
              <p className="text-sm font-medium leading-6 text-text-primary">
                {research.whyThisRole}
              </p>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold leading-5 text-text-primary">
                  Leadership Team
                </h3>
                {!research.leadershipLookedUp && <LeadershipTeamButton jobId={jobId} />}
              </div>
              {research.leadershipTeam && research.leadershipTeam.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {research.leadershipTeam.map((leader) => (
                    <LeaderCard key={`${leader.name}-${leader.title}`} leader={leader} />
                  ))}
                </div>
              ) : research.leadershipLookedUp ? (
                <p className="text-sm text-text-muted">
                  Searched, but no public leadership roster was found for this company.
                </p>
              ) : (
                <p className="text-sm text-text-muted">
                  Not looked up yet — this runs a separate, on-demand search.
                </p>
              )}
            </div>
          </div>

          <Sources sources={research.sources} />
        </>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-secondary">
            <Building2 className="h-6 w-6 text-text-muted" />
          </div>
          <p className="mt-5 text-sm font-semibold leading-5 text-text-primary">
            Building your briefing
          </p>
          <p className="mt-2 max-w-xs text-sm leading-6 text-text-muted">
            The AI is browsing {company}&apos;s public pages to build a dossier.
            This usually takes under a minute.
          </p>
          <div className="mt-5 flex items-center gap-2 rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent">
            <Sparkles className="h-3 w-3" />
            Candidate-specific briefing
          </div>
          <div className="mt-4">
            <AutoResearchCompany jobId={jobId} company={company} />
          </div>
        </div>
      )}
    </section>
  );
}
