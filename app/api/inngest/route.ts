import { serve } from "inngest/next";
import { inngest } from "../../../lib/inngest/client";
import { evaluateJobsAsync, generateResumeSuggestionAsync, sendMarketingBroadcastAsync, sendPushBroadcastAsync, generateGeoContentAsync, generateSuccessStoryAsync } from "../../../lib/inngest/functions";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [evaluateJobsAsync, generateResumeSuggestionAsync, sendMarketingBroadcastAsync, sendPushBroadcastAsync, generateGeoContentAsync, generateSuccessStoryAsync],
});