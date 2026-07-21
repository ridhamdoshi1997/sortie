// Minimum-cost public launch policy (see progress-tracker.md "Phase 0").
// Instant, zero-deploy-needed kill switches for the features that cost real
// money — flip an env var on Vercel and the feature stops spending within
// seconds, no code change or redeploy required. Unset/anything but "false"
// or "0" means enabled, so omitting these entirely changes nothing.
export type Feature = "search" | "document_generation" | "company_research" | "resume_extract";

const FEATURE_ENV_VARS: Record<Feature, string> = {
  search: "FEATURE_SEARCH_ENABLED",
  document_generation: "FEATURE_DOCUMENT_GENERATION_ENABLED",
  company_research: "FEATURE_COMPANY_RESEARCH_ENABLED",
  resume_extract: "FEATURE_RESUME_EXTRACT_ENABLED",
};

const FEATURE_LABELS: Record<Feature, string> = {
  search: "Job search",
  document_generation: "Document generation",
  company_research: "Company research",
  resume_extract: "Resume import",
};

export function isFeatureEnabled(feature: Feature): boolean {
  const value = process.env[FEATURE_ENV_VARS[feature]];
  return value !== "false" && value !== "0";
}

export function featureDisabledMessage(feature: Feature): string {
  return `${FEATURE_LABELS[feature]} is temporarily unavailable — please check back soon.`;
}
