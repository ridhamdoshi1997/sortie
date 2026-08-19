"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/audit";
import { getOutreachSignalSettings, setOutreachSignalProvider, type EnrichmentProvider, type OutreachSignalSettings } from "@/lib/admin/outreachSettings";
import { toUserMessage } from "@/lib/errors";

type SettingsResult = { success: true; settings: OutreachSignalSettings } | { success: false; error: string };

export async function getOutreachSignalSettingsAction(): Promise<SettingsResult> {
  try {
    await requireAdmin();
    const settings = await getOutreachSignalSettings();
    return { success: true, settings };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type ActionResult = { success: true } | { success: false; error: string };

export async function setOutreachSignalProviderAction(provider: EnrichmentProvider): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    await setOutreachSignalProvider(provider);
    await logAdminAction(admin, { action: "set_outreach_signal_provider", targetTable: "outreach_signal_settings", after: { provider } });

    revalidatePath("/admin/marketing");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}
