import { redirect } from "next/navigation";

import { getAdminTicketsList } from "@/actions/adminSupport";
import { SupportInbox } from "@/components/admin/SupportInbox";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const result = await getAdminTicketsList("all");
  if (!result.success) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Support</h1>
        <p className="mt-1 text-sm text-text-secondary">User-submitted tickets, from Settings → Contact support.</p>
      </div>
      <SupportInbox initialTickets={result.tickets} />
    </div>
  );
}
