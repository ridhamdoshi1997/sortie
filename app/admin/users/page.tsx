import { redirect } from "next/navigation";

import { getUsersPage } from "@/actions/admin";
import { UsersTable } from "@/components/admin/UsersTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const result = await getUsersPage(1, "");
  if (!result.success) {
    redirect("/");
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-text-primary">Users</h1>
      <UsersTable initialData={result.data} />
    </div>
  );
}
