"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

// In-app notification/activity inbox (build-plan.md §H). v1 write source:
// real application status milestones only (see actions/jobs.ts's
// notifyStatusMilestone) -- not every possible event in the app.
export async function listNotifications(): Promise<{ success: boolean; data?: NotificationRow[]; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.database
      .from("notifications")
      .select("id,type,title,body,link,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[actions/notifications] listNotifications", error);
      return { success: false, error: "Failed to load notifications" };
    }

    return { success: true, data: (data ?? []) as NotificationRow[] };
  } catch (error) {
    console.error("[actions/notifications] listNotifications", error);
    return { success: false, error: "Failed to load notifications" };
  }
}

export async function getUnreadNotificationCount(): Promise<{ success: boolean; count: number }> {
  try {
    const user = await requireUser();
    const insforge = await createInsforgeServer();
    const { count, error } = await insforge.database
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("[actions/notifications] getUnreadNotificationCount", error);
      return { success: false, count: 0 };
    }

    return { success: true, count: count ?? 0 };
  } catch (error) {
    console.error("[actions/notifications] getUnreadNotificationCount", error);
    return { success: false, count: 0 };
  }
}

export async function markNotificationRead(id: string): Promise<{ success: boolean }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("[actions/notifications] markNotificationRead", error);
      return { success: false };
    }

    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    console.error("[actions/notifications] markNotificationRead", error);
    return { success: false };
  }
}

export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("[actions/notifications] markAllNotificationsRead", error);
      return { success: false };
    }

    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    console.error("[actions/notifications] markAllNotificationsRead", error);
    return { success: false };
  }
}
