import Link from "next/link";
import type { Metadata } from "next";
import { Newspaper, Sparkles } from "lucide-react";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { NewsCard, hasLargeImage } from "@/components/news/NewsCard";
import { WeatherWidget } from "@/components/shared/WeatherWidget";
import { getCurrentUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { listNewsByCategory, NEWS_CATEGORY_LABELS, type NewsCategory } from "@/lib/newsIngestion";
import { getBriefing, type BriefingItem } from "@/lib/newsBriefing";
import type { Profile } from "@/types";

export const metadata: Metadata = {
  title: "Career News | Sortie",
  description:
    "Real hiring, layoff, and AI-and-work news — synthesized into what it actually means for your career, not just another headline.",
};

export const dynamic = "force-dynamic";

const CATEGORIES: NewsCategory[] = [
  "hiring_layoffs",
  "ai_future_of_work",
  "workplace_rto",
  "unions_worker_rights",
  "burnout_wellbeing",
  "gig_freelance",
];
const DEFAULT_CATEGORY: NewsCategory = "hiring_layoffs";

type Props = { searchParams: Promise<{ category?: string }> };

// "Your briefing" is a real tab, not a rail (2026-09-10, direct user
// request). It is only ever offered to a signed-in user, and only ever shows
// stories something in their own profile actually matched — see
// lib/newsBriefing.ts for the scoring and for why it never falls back to the
// generic feed relabelled as personal.
const BRIEFING = "briefing" as const;

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// Rebuilt 2026-09-10 (direct user request: "similar in look and feel to
// Google News — interactive, animated, professional"). What was taken from
// that reference is the LAYOUT language: a dated briefing header, a lead
// story carrying real visual weight, a secondary column, and a sidebar.
//
// What was deliberately NOT taken is its content model. This section stays
// career-scoped — Hiring & Layoffs and AI & Future of Work, the two
// categories build-plan.md defines — not a general news reader with World /
// Sports / Entertainment. Every story here still earns its place by having a
// real career takeaway attached, which is the whole reason this section
// exists rather than linking people to Google News.
export default async function NewsPage({ searchParams }: Props) {
  const { category: rawCategory } = await searchParams;
  const user = await getCurrentUser();
  const wantsBriefing = rawCategory === BRIEFING && !!user;
  const category = CATEGORIES.includes(rawCategory as NewsCategory) ? (rawCategory as NewsCategory) : DEFAULT_CATEGORY;

  // "Your briefing" is real personalization or it is absent — it reads the
  // same saved-company signal the dashboard's CareerRadar already uses, so
  // the two never disagree. A signed-out visitor, or one with no saved
  // companies, simply doesn't get this rail rather than getting a generic
  // feed relabelled as theirs.
  let briefing: BriefingItem[] = [];
  let profileLocation: string | null = null;
  let hasProfileSignal = false;
  if (user) {
    const insforge = await createInsforgeServer();
    const [{ data: profile }, { data: savedJobs }] = await Promise.all([
      insforge.database
        .from("profiles")
        .select("location,preferred_locations,job_titles_seeking,current_title,skills,industries")
        .eq("id", user.id)
        .maybeSingle<
          Pick<Profile, "location" | "preferred_locations" | "job_titles_seeking" | "current_title" | "skills" | "industries">
        >(),
      insforge.database
        .from("jobs")
        .select("company")
        .eq("user_id", user.id)
        .eq("is_saved", true)
        .not("company", "is", null)
        .limit(40)
        .returns<{ company: string | null }[]>(),
    ]);

    profileLocation = profile?.preferred_locations?.[0] ?? profile?.location ?? null;
    const savedCompanies = [...new Set((savedJobs ?? []).map((j) => j.company).filter((c): c is string => Boolean(c)))];

    hasProfileSignal = Boolean(
      profile?.job_titles_seeking?.length ||
        profile?.current_title ||
        profile?.skills?.length ||
        profile?.industries?.length ||
        savedCompanies.length,
    );

    briefing = await getBriefing({
      jobTitlesSeeking: profile?.job_titles_seeking ?? null,
      currentTitle: profile?.current_title ?? null,
      skills: profile?.skills ?? null,
      industries: profile?.industries ?? null,
      savedCompanies,
    });
  }

  const items = wantsBriefing ? briefing : await listNewsByCategory(category);
  // The lead slot is the one place a large image genuinely carries the
  // layout, so it goes to the newest story that actually HAS one rather than
  // simply the newest story — otherwise the hero renders text-only while a
  // perfectly good image sits in a card below it.
  const leadIndex = Math.max(0, items.findIndex(hasLargeImage));
  const lead = items[leadIndex];
  const rest = items.filter((_, i) => i !== leadIndex);
  const secondary = rest.slice(0, 6);
  const more = rest.slice(6);

  return (
    <>
      <Navbar isAuthenticated={!!user} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <div className="fade-in-up flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
              <Newspaper className="h-3.5 w-3.5" />
              Career News
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              {wantsBriefing ? "Your briefing" : "What's moving your job market"}
            </h1>
            <p className="text-sm text-text-secondary">{todayLabel()}</p>
          </div>
          {/* Renders nothing when the profile has no location — see
              components/shared/WeatherWidget.tsx. */}
          <WeatherWidget location={profileLocation} className="fade-in-up shrink-0" />
        </div>

        <div className="fade-in-up flex gap-1 overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ animationDelay: "40ms" }}>
          {user && (
            <Link
              href={`/news?category=${BRIEFING}`}
              className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                wantsBriefing
                  ? "text-text-primary after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent after:content-['']"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Your briefing
            </Link>
          )}
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/news?category=${c}`}
              className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                c === category && !wantsBriefing
                  ? "text-text-primary after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent after:content-['']"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {NEWS_CATEGORY_LABELS[c]}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          wantsBriefing ? (
            // Never falls back to the generic feed dressed up as personal —
            // that is exactly the false promise this app already had to undo
            // once on the "Recommended" jobs label.
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
              <p className="text-sm font-medium text-text-primary">
                {hasProfileSignal ? "Nothing matched your profile yet" : "Your briefing needs a profile first"}
              </p>
              <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-text-secondary">
                {hasProfileSignal
                  ? "Today's stories didn't touch your roles, skills, industries or the companies you've saved. Check the other tabs, or come back tomorrow — this refreshes daily."
                  : "Add the roles you're targeting, your skills and industries, and save a few jobs. This tab then only ever shows stories that match them."}
              </p>
              <Link
                href="/profile"
                className="btn-signal mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-accent-foreground"
              >
                {hasProfileSignal ? "Refine your profile" : "Complete your profile"}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              No {NEWS_CATEGORY_LABELS[category].toLowerCase()} stories yet — check back soon.
            </p>
          )
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-5">
              {lead && (
                <div className="flex flex-col gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Top story</h2>
                  <NewsCard item={lead} size="lead" matchedOn={wantsBriefing ? (lead as BriefingItem).matchedOn : undefined} />
                </div>
              )}

              {secondary.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {wantsBriefing ? "Matched to your profile" : NEWS_CATEGORY_LABELS[category]}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {secondary.map((item, i) => (
                      <NewsCard key={item.id} item={item} index={i} matchedOn={wantsBriefing ? (item as BriefingItem).matchedOn : undefined} />
                    ))}
                  </div>
                </div>
              )}

              {more.length > 0 && (
                <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-2">
                  <h2 className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    More headlines
                  </h2>
                  <div className="divide-y divide-border">
                    {more.map((item, i) => (
                      <NewsCard key={item.id} item={item} size="compact" index={i} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <aside className="flex flex-col gap-5">
              {/* Hidden on the briefing tab itself, where it would repeat the
                  main column verbatim. Elsewhere it is a genuine teaser for
                  that tab. */}
              {!wantsBriefing && briefing.length > 0 ? (
                <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-2">
                  <div className="flex items-center gap-1.5 px-3 pb-1 pt-2">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    {/* Labelled for what it now actually contains. It used to
                        be company-only news; it is now the profile-matched
                        briefing (lib/newsBriefing.ts), so "Companies you
                        follow" had become simply untrue. */}
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      For you
                    </h2>
                  </div>
                  <div className="divide-y divide-border">
                    {briefing.map((item, i) => (
                      <NewsCard key={item.id} item={item} size="compact" index={i} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-surface p-5">
                  <p className="text-sm font-medium text-text-primary">
                    {user ? "Nothing on your companies yet" : "Make this yours"}
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-text-secondary">
                    {user
                      ? "Save a job and any news about that employer shows up here, ahead of the general feed."
                      : "Sign in and save the jobs you're tracking — news about those employers gets pulled to the top."}
                  </p>
                  {!user && (
                    <Link
                      href="/login?mode=signup&next=/news"
                      className="btn-signal mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-accent-foreground"
                    >
                      Start for free
                    </Link>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-border bg-surface-secondary p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Why this feed</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Every story is real reporting from a named publisher, run through one AI pass that answers a
                  single question: what does this change for someone job-hunting right now. No general news,
                  no rewritten articles.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
