import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/siteUrl";
import { listPublishedPages } from "@/lib/admin/content";
import { listQuestionBankEntries } from "@/lib/interviewSeo";
import { listSalaryInsights } from "@/lib/salaryInsightsSeo";
import { withBuildTimeout } from "@/lib/buildTimeFetch";

// build-plan.md §I — real, generated sitemap covering the genuinely public
// marketing/content/tool surface, plus every real published blog post
// (including ones the SEO/GEO content engine drafts and an admin
// publishes). Next.js serves this at /sitemap.xml automatically from this
// file's default export.
//
// /interview-questions and /salary-insights have no on-site nav link — this
// sitemap is their only discovery path for crawlers, so every entry must be
// listed here, not just the hub route. (Missing this for
// /interview-questions when it shipped 2026-08-29 was caught and fixed
// 2026-08-30, alongside adding /salary-insights.)
const STATIC_ROUTES = [
  "",
  "/login",
  "/ats-checker",
  "/blog",
  "/interview-questions",
  "/salary-insights",
  "/news",
  "/privacy",
  "/terms",
  "/waitlist",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }));

  // Concurrent, and each one bounded. This route is prerendered, so these
  // three reads run at build time against a 60s per-route budget -- awaiting
  // them in sequence spent that budget three times over and failed the build
  // outright when the database was slow (2026-09-08). Now the route costs the
  // slowest read, and a read that cannot answer contributes no URLs instead of
  // taking the deploy down with it.
  const [pages, questionBankEntries, salaryInsights] = await Promise.all([
    withBuildTimeout("sitemap:blog", listPublishedPages, [] as Awaited<ReturnType<typeof listPublishedPages>>),
    withBuildTimeout("sitemap:interview-questions", listQuestionBankEntries, [] as Awaited<ReturnType<typeof listQuestionBankEntries>>),
    withBuildTimeout("sitemap:salary-insights", listSalaryInsights, [] as Awaited<ReturnType<typeof listSalaryInsights>>),
  ]);

  const pageEntries: MetadataRoute.Sitemap = pages.map((p) => ({
    url: `${siteUrl}/blog/${p.slug}`,
    lastModified: new Date(p.updatedAt),
  }));

  const interviewQuestionEntries: MetadataRoute.Sitemap = questionBankEntries.map((e) => ({
    url: `${siteUrl}/interview-questions/${e.slug}`,
    lastModified: new Date(),
  }));

  const salaryInsightEntries: MetadataRoute.Sitemap = salaryInsights.map((e) => ({
    url: `${siteUrl}/salary-insights/${e.slug}`,
    lastModified: new Date(e.mostRecentPosting || Date.now()),
  }));

  return [...staticEntries, ...pageEntries, ...interviewQuestionEntries, ...salaryInsightEntries];
}
