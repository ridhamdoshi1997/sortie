import { Settings } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { ComingSoon } from "@/components/shared/ComingSoon";

export default async function SettingsPage() {
  await requireUser();

  return (
    <>
      <Navbar isAuthenticated />
      <ComingSoon
        icon={Settings}
        title="Settings"
        description="Login & security, subscription, credits, and job alerts are coming here — for now, edit your profile directly."
      />
    </>
  );
}
