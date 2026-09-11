import { LinkHealthDashboard } from "@/components/admin/LinkHealthDashboard";
import { getLinkHealthFull } from "@/lib/admin/linkHealth";

export const dynamic = "force-dynamic";

// Apply-link quality at a glance (direct user request, 2026-08-30, while
// planning for launch). The original "29% of apply links point at
// low-quality mirror sites" problem was only discovered because a user
// happened to report one bad link and a script was run by hand — there
// was no way to SEE it.
//
// Phase 52 section 7: it was measuring the wrong table. It scanned `jobs`
// only, the small per-user slice created by searches, while
// `discovered_postings` — the ~810k-row crawl cache that is now the
// primary source users search — went entirely unmeasured. Both are
// reported now, separately, plus a trend and an on-demand repair trigger.
export default async function AdminLinkHealthPage() {
  const report = await getLinkHealthFull();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Link Health</h1>
        <p className="text-sm text-text-secondary">
          Where job apply links actually send candidates, across both the crawl cache and real search results. Bad links
          are repaired automatically every hour — this is the view that makes a problem visible before a user reports it.
        </p>
      </div>
      <LinkHealthDashboard initial={report} />
    </div>
  );
}
