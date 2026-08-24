import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/siteUrl";

// build-plan.md §I's "JobPosting structured data + sitemap + robots.txt" —
// the sitemap/robots half. Disallows every authenticated app surface and
// API route; only the genuinely public marketing/content/tool pages are
// crawlable.
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/admin/",
        "/dashboard",
        "/find-jobs",
        "/missions",
        "/career",
        "/resume",
        "/interview",
        "/profile",
        "/settings",
        "/notifications",
        "/saved-jobs",
        "/jobs/external",
        "/callback",
        "/preview",
        "/preview/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
