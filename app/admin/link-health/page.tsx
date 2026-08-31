import { getLinkHealth } from "@/actions/admin";
import { LinkHealthReport } from "@/components/admin/LinkHealthReport";

export const dynamic = "force-dynamic";

// Apply-link quality at a glance (direct user request, 2026-08-30, while
// planning for launch). The original "29% of apply links point at
// low-quality mirror sites" problem was only discovered because a user
// happened to report one bad link and a script was run by hand — there
// was no way to SEE it. Repair itself is automatic (the hourly
// repairApplyLinksAsync cron); this page is purely the visibility layer.
export default async function AdminLinkHealthPage() {
  const report = await getLinkHealth();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Link Health</h1>
        <p className="text-sm text-text-secondary">
          Where job apply links actually send candidates. Bad links are repaired automatically every hour —
          this is the view that makes a problem visible before a user reports it.
        </p>
      </div>
      <LinkHealthReport report={report} />
    </div>
  );
}
