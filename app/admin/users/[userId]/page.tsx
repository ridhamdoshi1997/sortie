import { redirect } from "next/navigation";

import { getUserDetailPage } from "@/actions/admin";
import { UserDetailView } from "@/components/admin/UserDetailView";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const result = await getUserDetailPage(userId);
  if (!result.success) {
    redirect("/admin/users");
  }

  return <UserDetailView detail={result.detail} notes={result.notes} />;
}
