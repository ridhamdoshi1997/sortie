export const DASHBOARD_WIDGET_KEYS = [
  "weeklyBriefing",
  "aiActionCenter",
  "pipelineFunnel",
  "pipelineStrategy",
  "matchDistribution",
  "activityHeatmap",
  "upcomingInterviews",
  "recentActivity",
  "rejectionRadar",
] as const;

export type DashboardWidgetKey = (typeof DASHBOARD_WIDGET_KEYS)[number];
