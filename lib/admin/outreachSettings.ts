import { createAdminDbClient } from "@/lib/admin/client";

// Signal-based outreach automation, inert paid half (Phase 18 item 5,
// context/RESUME.md). No agent can create a paid Clay/Apollo account — this
// mirrors the Sentry/Resend "wired but inert until a real key exists"
// pattern already used elsewhere in this app (see context/RESUME.md). The
// real API key itself is never stored in the DB — only in the
// ENRICHMENT_API_KEY server-only env var, exactly like OPENAI_API_KEY. The
// "configured" status is read LIVE from env var presence, never a
// DB toggle an admin could set to something untrue.
export type EnrichmentProvider = "clay" | "apollo";

export type OutreachSignalSettings = {
  provider: EnrichmentProvider | null;
  isConfigured: boolean;
};

export async function getOutreachSignalSettings(): Promise<OutreachSignalSettings> {
  const admin = createAdminDbClient();
  const { data } = await admin.database
    .from("outreach_signal_settings")
    .select("enrichment_provider")
    .eq("id", 1)
    .maybeSingle<{ enrichment_provider: EnrichmentProvider | null }>();

  return {
    provider: data?.enrichment_provider ?? null,
    isConfigured: Boolean(process.env.ENRICHMENT_API_KEY),
  };
}

export async function setOutreachSignalProvider(provider: EnrichmentProvider): Promise<void> {
  const admin = createAdminDbClient();
  await admin.database
    .from("outreach_signal_settings")
    .update({ enrichment_provider: provider, updated_at: new Date().toISOString() })
    .eq("id", 1);
}
