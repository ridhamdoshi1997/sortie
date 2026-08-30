import Link from "next/link";
import type { Metadata } from "next";
import { Newspaper, ExternalLink } from "lucide-react";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { listNewsByCategory, NEWS_CATEGORY_LABELS, type NewsCategory } from "@/lib/newsIngestion";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Career News | Sortie",
  description:
    "Real hiring, layoff, and AI-and-work news — synthesized into what it actually means for your career, not just another headline.",
};

export const revalidate = 3600;

const CATEGORIES: NewsCategory[] = ["hiring_layoffs", "ai_future_of_work"];
const DEFAULT_CATEGORY: NewsCategory = "hiring_layoffs";

type Props = { searchParams: Promise<{ category?: string }> };

// Cross-industry news section (direct user request 2026-08-30) — category
// tabs, not a personalized feed (that's CareerRadar.tsx on the dashboard,
// same underlying news_items table). Deliberately public/logged-out, same
// pattern as /interview-questions and /salary-insights.
export default async function NewsPage({ searchParams }: Props) {
  const { category: rawCategory } = await searchParams;
  const category = CATEGORIES.includes(rawCategory as NewsCategory) ? (rawCategory as NewsCategory) : DEFAULT_CATEGORY;

  const items = await listNewsByCategory(category);

  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
            <Newspaper className="h-3.5 w-3.5" />
            Career News
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            What&apos;s actually happening in your career market
          </h1>
          <p className="text-lg leading-8 text-text-secondary">
            Real news, synthesized into a concrete career takeaway — not just another headline.
          </p>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-border pb-px">
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/news?category=${c}`}
              className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                c === category
                  ? "border-b-2 border-accent text-text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {NEWS_CATEGORY_LABELS[c]}
            </Link>
          ))}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No {NEWS_CATEGORY_LABELS[category].toLowerCase()} stories yet — check back soon.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((item) => (
              <a
                key={item.id}
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-surface-secondary"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-text-primary">{item.title}</p>
                  <ExternalLink className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-muted group-hover:text-text-primary" />
                </div>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{item.ai_summary}</p>
                <div className="mt-3 rounded-lg bg-agent-light/50 px-3 py-2">
                  <p className="text-sm font-medium text-agent-dark">{item.ai_career_impact}</p>
                </div>
                <p className="mt-3 text-xs text-text-muted">
                  {item.source_name ?? "Source"}
                  {item.published_at ? ` · ${formatDate(item.published_at)}` : ""}
                </p>
              </a>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
