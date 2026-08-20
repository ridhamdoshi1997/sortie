"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import type { DashboardWidgetKey } from "@/lib/dashboardWidgets";

type ActionResult = { success: boolean; error?: string };

export async function setDashboardHiddenWidgets(hidden: DashboardWidgetKey[]): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("profiles")
      .update({ dashboard_hidden_widgets: hidden })
      .eq("id", user.id);

    if (error) {
      console.error("[actions/dashboardLayout] setDashboardHiddenWidgets", error);
      return { success: false, error: "Failed to save your dashboard layout" };
    }

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("[actions/dashboardLayout] setDashboardHiddenWidgets", error);
    return { success: false, error: "Failed to save your dashboard layout" };
  }
}
