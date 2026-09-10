import { ExternalLink } from "lucide-react";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { formatTimeAgo } from "@/lib/utils";
import type { NewsItem } from "@/lib/newsIngestion";

// One story, in three sizes, image-led like the Google News reference.
//
// The image is ALWAYS the article's own (news_items.image_url, supplied by
// the Serper ingestion path — see lib/newsIngestion.ts for why the free RSS
// feed cannot provide one). There is deliberately no stock/placeholder
// fallback: a story with no real image of its own renders a typographic card
// instead, because a decorative photo implying it illustrates specific real
// reporting would be a fabrication. Rows ingested before image_url existed
// simply fall into that typographic path until they age out of the feed.

export type NewsCardSize = "lead" | "standard" | "compact";

// Google's thumbnail cache serves ~120x66 images. That is genuinely fine in a
// 56px list row and looks like a smear stretched across a 740px lead card
// (measured live: natural 120x66 rendered at 742x240). So a thumbnail is only
// ever used small; a card that would need a large image and only has a
// thumbnail renders as a typographic card instead of a blurry one.
// hasLargeImage is also what app/news/page.tsx uses to pick which story leads.
export function isThumbnailOnly(url: string | null): boolean {
  return !url || url.includes("gstatic.com");
}

export function hasLargeImage(item: NewsItem): boolean {
  return !isThumbnailOnly(item.image_url);
}

// Plain <img>, not next/image: these are Google's own thumbnail-cache hosts,
// which would each need a next.config remotePattern entry, and the sizes here
// are small and fixed. referrerPolicy is required — the thumbnail hosts 403 a
// request that leaks a referrer.
function ArticleImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={`bg-surface-secondary object-cover ${className}`}
    />
  );
}

function PublisherMark({ item, size }: { item: NewsItem; size: "sm" | "md" }) {
  // CompanyLogo resolves a real logo from a domain through this app's own
  // /api/logo proxy, and falls back to a designed initial tile when it can't
  // — never a wrong or invented mark. source_domain comes straight from the
  // feed's <source url>; rows ingested before that column existed fall back
  // to the publisher NAME, which CompanyLogo guesses a domain from.
  return (
    <CompanyLogo
      company={item.source_name ?? "News"}
      logoUrl={null}
      applyUrl={item.source_domain ? `https://${item.source_domain}` : null}
      size={size}
    />
  );
}

function Meta({ item }: { item: NewsItem }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
      <span className="font-medium text-text-secondary">{item.source_name ?? "Source"}</span>
      {item.published_at && (
        <>
          <span aria-hidden="true">·</span>
          <span>{formatTimeAgo(item.published_at)}</span>
        </>
      )}
      {item.company_name && (
        <>
          <span aria-hidden="true">·</span>
          <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10.5px] font-medium text-text-secondary">
            {item.company_name}
          </span>
        </>
      )}
    </p>
  );
}

export function NewsCard({ item, size = "standard", index = 0 }: { item: NewsItem; size?: NewsCardSize; index?: number }) {
  const animationDelay = `${Math.min(index, 8) * 45}ms`;

  if (size === "compact") {
    return (
      <a
        href={item.source_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ animationDelay }}
        className="dim-card-in group flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-surface-secondary"
      >
        <PublisherMark item={item} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-[13.5px] font-medium leading-snug text-text-primary transition-colors group-hover:text-accent">
            {item.title}
          </p>
          <div className="mt-1.5">
            <Meta item={item} />
          </div>
        </div>
        {item.image_url && (
          <ArticleImage src={item.image_url} alt="" className="h-14 w-16 shrink-0 rounded-lg" />
        )}
      </a>
    );
  }

  if (size === "lead") {
    return (
      <a
        href={item.source_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ animationDelay }}
        className="dim-card-in group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-card"
      >
        {hasLargeImage(item) && item.image_url && (
          <ArticleImage
            src={item.image_url}
            alt=""
            className="h-48 w-full transition-transform duration-500 group-hover:scale-[1.03] sm:h-60"
          />
        )}
        <div className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <PublisherMark item={item} size="md" />
          <Meta item={item} />
        </div>
        <h3 className="font-display text-xl font-bold leading-tight tracking-tight text-text-primary transition-colors group-hover:text-accent sm:text-2xl">
          {item.title}
        </h3>
        <p className="text-sm leading-6 text-text-secondary">{item.ai_summary}</p>
        <div className="rounded-xl border-l-2 border-agent bg-agent-light px-4 py-3">
          <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
            What it means for you
          </p>
          <p className="text-sm leading-6 text-agent-dark">{item.ai_career_impact}</p>
        </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={item.source_url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ animationDelay }}
      className="dim-card-in group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-card"
    >
      {hasLargeImage(item) && item.image_url && (
        <ArticleImage
          src={item.image_url}
          alt=""
          className="h-36 w-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
      )}
      <div className="flex flex-col gap-2.5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <PublisherMark item={item} size="sm" />
          <Meta item={item} />
        </div>
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted transition-colors group-hover:text-accent" />
      </div>
      <p className="text-[15px] font-semibold leading-snug text-text-primary transition-colors group-hover:text-accent">
        {item.title}
      </p>
      <p className="line-clamp-2 text-sm leading-6 text-text-secondary">{item.ai_summary}</p>
      {/* The full Agent Content recipe from context/ui-tokens.md (tinted
          ground + agent border), scaled down for this denser card — not a
          bare left rule. A 2px accent border with no tint behind it was an
          ad-hoc half-version of that pattern and read as a generic side tab. */}
      <p className="line-clamp-2 rounded-lg border-l-2 border-agent bg-agent-light px-3 py-2 text-[13px] leading-5 text-agent-dark">
        {item.ai_career_impact}
      </p>
      </div>
    </a>
  );
}
