import { serve } from "inngest/next";
import { inngest } from "../../../lib/inngest/client";
import { evaluateJobsAsync, evaluateJobChunk, generateResumeSuggestionAsync, sendMarketingBroadcastAsync, sendPushBroadcastAsync, generateGeoContentAsync, generateSuccessStoryAsync, sendFollowUpNudgesAsync, generateWeeklyBriefingsAsync, resetLifetimePlanUsagePeriodsAsync, archiveStaleInboxJobsAsync, reconcileStuckAgentRunsAsync, syncNewsItemsAsync, repairApplyLinksAsync } from "../../../lib/inngest/functions";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [evaluateJobsAsync, evaluateJobChunk, generateResumeSuggestionAsync, sendMarketingBroadcastAsync, sendPushBroadcastAsync, generateGeoContentAsync, generateSuccessStoryAsync, sendFollowUpNudgesAsync, generateWeeklyBriefingsAsync, resetLifetimePlanUsagePeriodsAsync, archiveStaleInboxJobsAsync, reconcileStuckAgentRunsAsync, syncNewsItemsAsync, repairApplyLinksAsync],
});