"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { createExternalJob } from "@/lib/externalJob";
import { fetchViaJinaReader } from "@/agent/research";
import {
  verifyNotionToken,
  listAccessibleDatabases,
  ensureTrackerProperties,
  createTrackerPage,
  updateTrackerPage,
  listDatabasePages,
  type NotionDatabaseSummary,
} from "@/lib/notion";

type ActionResult = { success: boolean; error?: string };

type NotionConnectionRow = {
  notion_token: string | null;
  notion_database_id: string | null;
  notion_database_name: string | null;
  notion_last_synced_at: string | null;
};

export async function listNotionDatabasesForToken(
  token: string,
): Promise<{ success: boolean; error?: string; databases?: NotionDatabaseSummary[] }> {
  await requireUser();

  const trimmed = token.trim();
  if (!trimmed) {
    return { success: false, error: "Paste your Notion integration token first" };
  }

  const { valid } = await verifyNotionToken(trimmed);
  if (!valid) {
    return { success: false, error: "That token didn't work — check you copied it correctly" };
  }

  const databases = await listAccessibleDatabases(trimmed);
  if (databases.length === 0) {
    return {
      success: false,
      error: "No databases shared with this integration yet — share one from Notion first (••• menu → Connections)",
    };
  }

  return { success: true, databases };
}

export async function connectNotionDatabase(
  token: string,
  databaseId: string,
  databaseName: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const trimmed = token.trim();

  try {
    await ensureTrackerProperties(trimmed, databaseId);

    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("profiles")
      .update({
        notion_token: trimmed,
        notion_database_id: databaseId,
        notion_database_name: databaseName,
        notion_last_synced_at: null,
      })
      .eq("id", user.id);

    if (error) {
      console.error("[actions/notion] connectNotionDatabase", error);
      return { success: false, error: "Failed to save the connection" };
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    console.error("[actions/notion] connectNotionDatabase", error);
    return { success: false, error: "Failed to connect to that database" };
  }
}

export async function getNotionConnectionStatus(): Promise<{
  connected: boolean;
  databaseName?: string;
  lastSyncedAt?: string | null;
}> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data } = await insforge.database
    .from("profiles")
    .select("notion_token,notion_database_name,notion_last_synced_at")
    .eq("id", user.id)
    .maybeSingle<NotionConnectionRow>();

  if (!data?.notion_token) {
    return { connected: false };
  }

  return {
    connected: true,
    databaseName: data.notion_database_name ?? undefined,
    lastSyncedAt: data.notion_last_synced_at,
  };
}

export async function disconnectNotion(): Promise<ActionResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { error } = await insforge.database
    .from("profiles")
    .update({
      notion_token: null,
      notion_database_id: null,
      notion_database_name: null,
      notion_last_synced_at: null,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[actions/notion] disconnectNotion", error);
    return { success: false, error: "Failed to disconnect" };
  }

  revalidatePath("/profile");
  return { success: true };
}

type SyncableJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  url: string | null;
  source_url: string | null;
  application_status: string | null;
  recommendation_score: number | null;
  notion_page_id: string | null;
};

// Mirrors the Missions pipeline (build-plan.md §16) into the connected
// Notion database — same `is_hidden = false` scope Missions itself uses
// (app/missions/page.tsx), so this reflects the same tracker a user already
// sees in-app, not the full raw discovery firehose of every job ever scored.
export async function syncTrackerToNotion(): Promise<ActionResult & { synced?: number }> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("notion_token,notion_database_id")
    .eq("id", user.id)
    .maybeSingle<{ notion_token: string | null; notion_database_id: string | null }>();

  if (!profile?.notion_token || !profile.notion_database_id) {
    return { success: false, error: "Connect a Notion database first" };
  }

  const { data: jobs, error } = await insforge.database
    .from("jobs")
    .select("id,title,company,location,url,source_url,application_status,recommendation_score,notion_page_id")
    .eq("user_id", user.id)
    .eq("is_hidden", false)
    .order("found_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[actions/notion] syncTrackerToNotion", error);
    return { success: false, error: "Failed to load your tracked jobs" };
  }

  let synced = 0;
  for (const job of (jobs ?? []) as SyncableJob[]) {
    const input = {
      title: job.title ?? "Untitled role",
      company: job.company,
      location: job.location,
      url: job.url ?? job.source_url,
      applicationStatus: job.application_status,
      matchScore: job.recommendation_score,
    };

    const pageId = job.notion_page_id
      ? (await updateTrackerPage(profile.notion_token, job.notion_page_id, input))
        ? job.notion_page_id
        : null
      : await createTrackerPage(profile.notion_token, profile.notion_database_id, input);

    if (pageId && pageId !== job.notion_page_id) {
      await insforge.database.from("jobs").update({ notion_page_id: pageId }).eq("id", job.id);
    }
    if (pageId) synced += 1;
  }

  await insforge.database
    .from("profiles")
    .update({ notion_last_synced_at: new Date().toISOString() })
    .eq("id", user.id);

  revalidatePath("/profile");
  return { success: true, synced };
}

// Read-back direction: pages a user added directly in Notion (not pushed by
// syncTrackerToNotion above) become new leads here, same evaluation path as
// the existing "paste a job from anywhere" flow (lib/externalJob.ts).
export async function importLeadsFromNotion(): Promise<ActionResult & { imported?: number }> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("notion_token,notion_database_id")
    .eq("id", user.id)
    .maybeSingle<{ notion_token: string | null; notion_database_id: string | null }>();

  if (!profile?.notion_token || !profile.notion_database_id) {
    return { success: false, error: "Connect a Notion database first" };
  }

  const { data: linkedJobs } = await insforge.database
    .from("jobs")
    .select("notion_page_id")
    .eq("user_id", user.id)
    .not("notion_page_id", "is", null);

  const linkedPageIds = new Set((linkedJobs ?? []).map((j: { notion_page_id: string | null }) => j.notion_page_id));

  const pages = await listDatabasePages(profile.notion_token, profile.notion_database_id);
  const newLeads = pages.filter((p) => p.url && !linkedPageIds.has(p.id));

  let imported = 0;
  for (const lead of newLeads) {
    const text = await fetchViaJinaReader(lead.url!);
    const description =
      text?.slice(0, 12000) ||
      `Imported from Notion. ${lead.company ? `Company: ${lead.company}. ` : ""}No further description was available from the linked URL.`;

    const result = await createExternalJob(insforge, user.id, {
      title: lead.title || "Imported role",
      company: lead.company || "Unknown company",
      description,
      url: lead.url!,
    });

    if (result.success) {
      await insforge.database.from("jobs").update({ notion_page_id: lead.id }).eq("id", result.jobId);
      imported += 1;
    }
  }

  revalidatePath("/profile");
  revalidatePath("/find-jobs");
  return { success: true, imported };
}
