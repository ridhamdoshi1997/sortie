import Link from "next/link";
import { Satellite, ExternalLink } from "lucide-react";

import type { NewsItem } from "@/lib/newsIngestion";

// Personalized half of the news section (direct user request 2026-08-30) —
// same underlying news_items table /news reads generically, filtered here
// to the user's own saved companies (see getCareerRadarItems in
// app/dashboard/page.tsx). Falls back to the latest cross-industry Hiring &
// Layoffs items when nothing matches yet, so a new user never sees a dead
// widget on day one — same "never launch empty" principle as the news
// ingestion backfill itself.
export function CareerRadar({ items, isPersonalized }: { items: NewsItem[]; isPersonalized: boolean }) {
  return (
    <div className={`border border-border bg-surface shadow-card rounded-2xl p-6 ${items.length > 0 ? "border-l-2 border-l-agent" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="signal-icon-chip">
            <Satellite className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold leading-6 text-text-primary">Career Radar</h2>
        </div>
        <Link href="/news" className="text-xs font-medium text-text-secondary hover:text-text-primary">
          More news
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-5 text-sm text-text-muted">
          Save a company from a job you&apos;re researching and Career Radar will start tracking real news about it here.
        </p>
      ) : (
        <>
          {!isPersonalized && (
            <p className="mt-3 text-xs text-text-muted">
              No saved-company news yet — here&apos;s what&apos;s moving market-wide.
            </p>
          )}
          <ul className="mt-4 flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between gap-3 rounded-lg p-1.5 transition-colors hover:bg-surface-secondary"
                >
                  <div className="min-w-0">
                    {item.company_name && (
                      <span className="mb-1 inline-block rounded-full bg-agent-light px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-agent-dark">
                        {item.company_name}
                      </span>
                    )}
                    <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{item.ai_career_impact}</p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-muted group-hover:text-text-primary" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
