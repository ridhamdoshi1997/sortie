import { redirect } from "next/navigation";

import { getAdminRoster } from "@/actions/admin";
import { TeamRoster } from "@/components/admin/TeamRoster";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage() {
  const result = await getAdminRoster();
  if (!result.success) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Team &amp; Roles</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Add other people as admins with a scoped role. Hardcoded 3-tier permissions, not a permission-matrix builder.
        </p>
      </div>
      <TeamRoster initialAdmins={result.admins} viewerRole={result.viewerRole} />
    </div>
  );
}
