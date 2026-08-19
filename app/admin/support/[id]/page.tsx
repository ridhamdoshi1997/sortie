import { redirect, notFound } from "next/navigation";

import { getAdminTicketDetail } from "@/actions/adminSupport";
import { getAdminRoster } from "@/actions/admin";
import { SupportTicketDetail } from "@/components/admin/SupportTicketDetail";

export const dynamic = "force-dynamic";

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detailResult, rosterResult] = await Promise.all([getAdminTicketDetail(id), getAdminRoster()]);

  if (!rosterResult.success) {
    redirect("/dashboard");
  }
  if (!detailResult.success) {
    notFound();
  }

  return <SupportTicketDetail initialTicket={detailResult.ticket} initialMessages={detailResult.messages} viewerRole={rosterResult.viewerRole} />;
}
