import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/siteUrl";
import { listPublishedPages } from "@/lib/admin/content";

// build-plan.md §I — real, generated sitemap covering the genuinely public
// marketing/content/tool surface, plus every real published blog post
// (including ones the SEO/GEO content engine drafts and an admin
// publishes). Next.js serves this at /sitemap.xml automatically from this
// file's default export.
const STATIC_ROUTES = ["", "/login", "/ats-checker", "/blog", "/privacy", "/terms", "/waitlist"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }));

  const pages = await listPublishedPages();
  const pageEntries: MetadataRoute.Sitemap = pages.map((p) => ({
    url: `${siteUrl}/blog/${p.slug}`,
    lastModified: new Date(p.updatedAt),
  }));

  return [...staticEntries, ...pageEntries];
}
