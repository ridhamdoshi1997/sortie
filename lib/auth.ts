import { redirect } from "next/navigation";

import { isWithinSignupCap } from "@/lib/access";
import { createInsforgeServer } from "@/lib/insforge-server";

type ProfileCompletionRow = {
  is_complete: boolean | null;
};

export async function getCurrentUser() {
  const insforge = await createInsforgeServer();
  const { data, error } = await insforge.auth.getCurrentUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Minimum-cost public launch policy (see progress-tracker.md "Phase 0") —
  // bounds worst-case AI/Browserbase spend by capping total accounts.
  // Their auth account already exists (InsForge provisions it on OAuth
  // before any app code runs); this only gates access to the product, not
  // account creation itself.
  const insforge = await createInsforgeServer();
  const withinCap = await isWithinSignupCap(insforge, user.id, user.email);
  if (!withinCap) {
    redirect("/waitlist");
  }

  return user;
}

export async function getPostLoginRedirectPath(userId: string): Promise<string> {
  const insforge = await createInsforgeServer();
  const { data, error } = await insforge.database
    .from("profiles")
    .select("is_complete")
    .eq("id", userId)
    .maybeSingle<ProfileCompletionRow>();

  if (error || !data?.is_complete) {
    return "/profile";
  }

  return "/dashboard";
}
