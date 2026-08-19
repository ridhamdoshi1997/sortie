import { redirect } from "next/navigation";

import { getAdminTicketsList } from "@/actions/adminSupport";
import { getAdminRoster } from "@/actions/admin";
import { SupportInbox } from "@/components/admin/SupportInbox";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const [result, rosterResult] = await Promise.all([getAdminTicketsList("all"), getAdminRoster()]);
  if (!result.success || !rosterResult.success) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Support</h1>
        <p className="mt-1 text-sm text-text-secondary">User-submitted tickets, from Settings → Contact support, plus manually logged ones.</p>
      </div>
      <SupportInbox initialTickets={result.tickets} viewerRole={rosterResult.viewerRole} />
    </div>
  );
}
