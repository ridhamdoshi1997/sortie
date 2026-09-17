import { Bell } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/Navbar";
import { listNotifications } from "@/actions/notifications";
import { NotificationsList } from "@/components/notifications/NotificationsList";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireUser();
  const result = await listNotifications();

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-secondary">
            <Bell className="h-5 w-5 text-text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">Notifications</h1>
            <p className="text-sm text-text-secondary">Real milestones from your tracked applications.</p>
          </div>
        </div>

        <NotificationsList initialNotifications={result.data ?? []} />
      </main>
    </>
  );
}
