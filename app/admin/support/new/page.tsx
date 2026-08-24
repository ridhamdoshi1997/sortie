import { NewSupportTicketForm } from "@/components/admin/NewSupportTicketForm";

export const dynamic = "force-dynamic";

export default function NewSupportTicketPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">New ticket</h1>
        <p className="mt-1 text-sm text-text-secondary">Log a support contact that didn&apos;t come through the app — a call, a walk-up conversation, anything.</p>
      </div>
      <NewSupportTicketForm />
    </div>
  );
}
