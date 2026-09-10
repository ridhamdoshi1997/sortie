import { redirect } from "next/navigation";

import { loadSystemHealth } from "@/actions/adminSystem";
import { SystemHealthPanel } from "@/components/admin/SystemHealthPanel";

// Live operational state — never cached. An operator checking whether the
// crawls are running right now must not be shown a stale render, the same
// reason app/admin/page.tsx is force-dynamic.
export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const result = await loadSystemHealth();
  if (!result.success) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">System Health</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Crawls, caches, the news pipeline and every external service this app depends on.
        </p>
      </div>
      <SystemHealthPanel initialData={result.data} />
    </div>
  );
}
