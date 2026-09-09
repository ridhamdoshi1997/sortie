import { serve } from "inngest/next";
import { inngest } from "../../../lib/inngest/client";
import { evaluateJobsAsync, evaluateJobChunk, evaluateJobFullAsync, extractJobDetailsAsync, generateResumeSuggestionAsync, sendMarketingBroadcastAsync, sendPushBroadcastAsync, generateGeoContentAsync, generateSuccessStoryAsync, sendFollowUpNudgesAsync, generateWeeklyBriefingsAsync, resetLifetimePlanUsagePeriodsAsync, archiveStaleInboxJobsAsync, reconcileStuckAgentRunsAsync, syncNewsItemsAsync, repairApplyLinksAsync, proactiveAtsCrawlAsync, proactiveWorkdayCrawlAsync, proactiveIcimsCrawlAsync, pruneCrawlCacheAsync, legitimacyRecheckAsync, jobhiveRegistrySyncAsync, fetchPaidSourcesAsync } from "../../../lib/inngest/functions";

// Explicit, and load-bearing (added 2026-09-03). Next.js route handlers on
// Vercel default to a 10-15s timeout, and the proactive crawl's own steps
// are measured at ~12s for a 150-company batch — so the crawl was running
// right at, and plausibly over, the default limit in production, where a
// timeout means the whole batch's work is lost and its companies never get
// their cursor bumped. 60s is the ceiling available on every Vercel plan
// (higher values need Pro), and leaves real headroom over the largest batch
// this file's crawls are tuned to produce. See CRAWL_BATCH_SIZE in
// lib/proactiveAtsCrawl.ts, which is sized against this number.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [evaluateJobsAsync, evaluateJobChunk, evaluateJobFullAsync, extractJobDetailsAsync, generateResumeSuggestionAsync, sendMarketingBroadcastAsync, sendPushBroadcastAsync, generateGeoContentAsync, generateSuccessStoryAsync, sendFollowUpNudgesAsync, generateWeeklyBriefingsAsync, resetLifetimePlanUsagePeriodsAsync, archiveStaleInboxJobsAsync, reconcileStuckAgentRunsAsync, syncNewsItemsAsync, repairApplyLinksAsync, proactiveAtsCrawlAsync, proactiveWorkdayCrawlAsync, proactiveIcimsCrawlAsync, pruneCrawlCacheAsync, legitimacyRecheckAsync, jobhiveRegistrySyncAsync, fetchPaidSourcesAsync],
});