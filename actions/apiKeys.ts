"use server";

import { randomBytes, createHash } from "crypto";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";

type ActionResult = { success: boolean; error?: string };

// §Q5 Capture Layer — personal API keys for the browser extension, since a
// Manifest V3 content script can't share the web app's session cookie. Only
// a SHA-256 hash is ever stored (mirrors how InsForge itself never returns a
// stored secret) — the raw key is generated here, returned to the caller
// exactly once, and never persisted or logged anywhere past this call.
const KEY_PREFIX = "sortie_";

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export type ApiKeyRow = {
  id: string;
  key_prefix: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
};

export async function listApiKeys(): Promise<{ success: boolean; data?: ApiKeyRow[]; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.database
      .from("user_api_keys")
      .select("id,key_prefix,label,created_at,last_used_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[actions/apiKeys] listApiKeys", error);
      return { success: false, error: "Failed to load your API keys" };
    }

    return { success: true, data: (data ?? []) as ApiKeyRow[] };
  } catch (error) {
    console.error("[actions/apiKeys] listApiKeys", error);
    return { success: false, error: "Failed to load your API keys" };
  }
}

export async function generateApiKey(
  label: string,
): Promise<{ success: boolean; rawKey?: string; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const rawKey = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
    const keyPrefix = rawKey.slice(0, KEY_PREFIX.length + 6);

    const { error } = await insforge.database.from("user_api_keys").insert([
      {
        user_id: user.id,
        key_hash: hashKey(rawKey),
        key_prefix: keyPrefix,
        label: label.trim() || "Browser extension",
      },
    ]);

    if (error) {
      console.error("[actions/apiKeys] generateApiKey", error);
      return { success: false, error: "Failed to generate a new key" };
    }

    revalidatePath("/settings");
    return { success: true, rawKey };
  } catch (error) {
    console.error("[actions/apiKeys] generateApiKey", error);
    return { success: false, error: "Failed to generate a new key" };
  }
}

export async function revokeApiKey(id: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("user_api_keys")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/apiKeys] revokeApiKey", error);
      return { success: false, error: "Failed to revoke this key" };
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error("[actions/apiKeys] revokeApiKey", error);
    return { success: false, error: "Failed to revoke this key" };
  }
}
