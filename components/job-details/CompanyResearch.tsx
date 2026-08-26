import Link from "next/link";
import type { ComponentType } from "react";
import {
  Building2,
  CircleHelp,
  Code2,
  Compass,
  ListChecks,
  Lock,
  MessageSquareText,
  Newspaper,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

import { CompanyResearchAutoLoader } from "@/components/job-details/CompanyResearchAutoLoader";
import { LeadershipTeamButton } from "@/components/job-details/LeadershipTeamButton";
import { LinkedInGlyph } from "@/components/shared/LinkedInGlyph";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import type { CompanyLeader, CompanyResearchDossier } from "@/types";

type Props = {
  company: string;
  jobId: string;
  research: CompanyResearchDossier | null;
  // Server-computed from the current plan's companyResearchMonthlyLimit
  // (find-jobs/[id]/page.tsx) — false means the plan's limit is 0 (Recon).
  // Unlike InsiderConnectionsButton, this feature auto-fires on mount
  // (CompanyResearchAutoLoader) rather than waiting for a click, so the
  // gate has to happen HERE, before that component ever mounts — there's
  // no click to intercept.
  companyResearchAllowed: boolean;
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

function ResearchList({ title, items, icon: Icon, variant, index = 0 }: SectionProps & { index?: number }) {
  if (items.length === 0) return null;

  return (
    <div
      className="dim-card-in rounded-xl border border-border bg-surface-secondary p-4 transition-colors hover:border-agent/25"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
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
        {items.map((item, i) => (
          <span
            key={item}
            className="dim-card-in inline-flex items-center gap-1 rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent transition-transform hover:-translate-y-0.5"
            style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
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
    <div className="flex flex-col items-center rounded-xl border border-border bg-surface-secondary p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-agent/25 hover:shadow-card">
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

export function CompanyResearch({ company, jobId, research, companyResearchAllowed }: Props) {
  return (
    <section className="border border-border bg-surface shadow-card overflow-hidden rounded-2xl">
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
            <div className="dim-card-in rounded-xl border border-border bg-surface-secondary p-4">
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
                index={0}
                title="Culture"
                items={research.culture}
                icon={Users}
                variant="info"
              />
              <ResearchList
                index={1}
                title="Your Edge"
                items={research.yourEdge}
                icon={ShieldCheck}
                variant="success"
              />
              <ResearchList
                index={2}
                title="Gaps to Address"
                items={research.gapsToAddress}
                icon={ListChecks}
              />
              <ResearchList
                index={3}
                title="Smart Questions"
                items={research.smartQuestions}
                icon={CircleHelp}
                variant="info"
              />
              <ResearchList
                index={4}
                title="Interview Prep"
                items={research.interviewPrep}
                icon={MessageSquareText}
                variant="success"
              />
              <ResearchList
                index={5}
                title="Recent Updates"
                items={research.recentUpdates ?? []}
                icon={Newspaper}
                variant="info"
              />
            </div>

            {/* Every other box in this dossier (Culture, Tech Stack, Gaps…)
                is factual company research; this one is the one genuinely
                personalized read — this candidate, this role, why it fits —
                so it's the one pane here that earns the "AI Navigator
                reads" agent-teal treatment other opt-in AI generators on
                this page already use. */}
            <AiReadsCard label="Why this role fits you">
              <p className="text-sm leading-6 text-text-primary">{research.whyThisRole}</p>
            </AiReadsCard>

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
      ) : companyResearchAllowed ? (
        // GenerationProgress (inside CompanyResearchAutoLoader) already
        // carries the full card visual — no outer wrapper card here
        // anymore, that would just be a card nested inside a card.
        <div className="flex min-h-64 items-center justify-center px-6 py-14">
          <CompanyResearchAutoLoader jobId={jobId} company={company} />
        </div>
      ) : (
        // Recon plan — never even fires the auto-loader's fetch. This is a
        // true pre-emptive gate, not just a nicer error after a blocked
        // call: company research runs unprompted on mount, so intercepting
        // it here is the only way to avoid a wasted round trip.
        <div className="flex min-h-64 flex-col items-center justify-center px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-secondary text-text-muted">
            <Lock className="h-6 w-6" />
          </div>
          <p className="mt-5 text-sm font-semibold leading-5 text-text-primary">
            Company research is a Command feature
          </p>
          <p className="mt-2 max-w-xs text-sm leading-6 text-text-muted">
            Upgrade to unlock AI-built company dossiers — culture, tech stack, leadership, and
            candidate-specific interview prep for {company}.
          </p>
          <Link
            href="/pricing"
            className="btn-signal mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground"
          >
            <TrendingUp className="h-4 w-4" />
            See Command plan
          </Link>
        </div>
      )}
    </section>
  );
}
