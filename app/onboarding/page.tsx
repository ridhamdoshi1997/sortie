export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

type OnboardingGateRow = {
  onboarding_completed_at: string | null;
  is_complete: boolean | null;
};

export default async function OnboardingPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data } = await insforge.database
    .from("profiles")
    .select("onboarding_completed_at,is_complete")
    .eq("id", user.id)
    .maybeSingle<OnboardingGateRow>();

  // Already ran this once — don't show it again on a direct /onboarding
  // visit (e.g. back-button, a stale bookmark).
  if (data?.onboarding_completed_at) {
    redirect(data.is_complete ? "/dashboard" : "/profile");
  }

  return <OnboardingWizard />;
}
