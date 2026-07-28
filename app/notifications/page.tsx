import { Bell } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { ComingSoon } from "@/components/shared/ComingSoon";

export default async function NotificationsPage() {
  await requireUser();

  return (
    <>
      <Navbar isAuthenticated />
      <ComingSoon
        icon={Bell}
        title="Notifications"
        description="Job alerts and activity notifications are coming here."
      />
    </>
  );
}
