import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MessageSquare, Users } from "lucide-react";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { CompanyContributeButton } from "@/components/interview/CompanyContributeButton";
import { getInterviewHubData } from "@/lib/interviewHub";
import { listQuestionBankEntries } from "@/lib/interviewSeo";
import { listContributedQuestionsByCompanyKey } from "@/actions/interviewContributions";
import { getCurrentUser } from "@/lib/auth";
import { toCompanyKey } from "@/lib/atsRegistry";

type Props = { params: Promise<{ key: string }> };

async function loadCompanyPage(key: string) {
  const [hub, banks, contributed] = await Promise.all([
    getInterviewHubData(),
    listQuestionBankEntries(),
    listContributedQuestionsByCompanyKey(key),
  ]);

  const card = hub.sections.flatMap((s) => s.companies).find((c) => c.companyKey === key);
  const bankEntries = banks.filter((b) => toCompanyKey(b.company) === key);
  const companyName = card?.companyName ?? bankEntries[0]?.company ?? contributed[0]?.company ?? null;

  if (!companyName || (bankEntries.length === 0 && contributed.length === 0)) return null;

  return { companyName, domain: card?.domain ?? null, activePostings: card?.activePostings ?? 0, bankEntries, contributed };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const result = await loadCompanyPage(key);
  if (!result) return { title: "Interview questions | Sortie" };
  const total = result.bankEntries.reduce((n, e) => n + e.questions.length, 0) + result.contributed.length;
  return {
    title: `${result.companyName} Interview Questions | Sortie`,
    description: `${total} real interview question${total === 1 ? "" : "s"} for ${result.companyName}, generated for real candidates or submitted by people who were actually asked.`,
  };
}

// Company-level aggregate view (2026-09-10) — sits above the existing
// per-role-family SEO pages (app/interview-questions/[slug]/page.tsx, left
// untouched for their own backlink value) and merges in the new
// contributed questions, which have no role-family grouping of their own.
export default async function InterviewCompanyPage({ params }: Props) {
  const { key } = await params;
  const result = await loadCompanyPage(key);
  if (!result) notFound();

  const { companyName, domain, activePostings, bankEntries, contributed } = result;
  const user = await getCurrentUser();

  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16 sm:px-6 lg:px-8">
        <Link href="/interview-questions" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" />
          All companies
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* No logoUrl here — CompanyLogo's own chain (unavatar.io via the
                ad-blocker-safe /api/logo proxy, see components/shared/CompanyLogo.tsx)
                already resolves a real logo from a domain; passing the real
                resolved `domain` as applyUrl lets extractLikelyLogoDomain use it
                directly instead of falling back to a name guess. */}
            <CompanyLogo company={companyName} logoUrl={null} applyUrl={domain ? `https://${domain}` : null} size="lg" />
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
                Interview questions at {companyName}
              </h1>
              {activePostings > 0 && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-text-secondary">
                  <Users className="h-3.5 w-3.5" />
                  {activePostings} open role{activePostings === 1 ? "" : "s"} right now
                </p>
              )}
            </div>
          </div>
          <CompanyContributeButton company={companyName} isSignedIn={!!user} />
        </div>

        {bankEntries.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              AI-generated, by role
            </h2>
            {bankEntries.map((entry) => (
              <Link
                key={entry.slug}
                href={`/interview-questions/${entry.slug}`}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
              >
                <div>
                  <p className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                    <span className="rounded-full bg-agent-light px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-agent-dark">
                      AI
                    </span>
                    {entry.roleFamily}
                    {entry.seniority ? ` · ${entry.seniority}` : ""}
                  </p>
                </div>
                <p className="text-xs text-text-muted">{entry.questions.length} questions</p>
              </Link>
            ))}
          </div>
        )}

        {contributed.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              From real candidates
            </h2>
            {contributed.map((q) => (
              <div key={q.id} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-surface-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                    {q.role}
                  </span>
                  {q.interviewDate && (
                    <span className="text-xs text-text-muted">
                      Interviewed {new Date(q.interviewDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  )}
                </div>
                <p className="mt-2 flex items-start gap-2 text-base font-medium text-text-primary">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                  {q.question}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
