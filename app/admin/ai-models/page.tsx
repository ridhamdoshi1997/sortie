import { getModelConfigForAdmin } from "@/actions/admin";
import { AiModelsManager } from "@/components/admin/AiModelsManager";
import { ModelHealthPanel } from "@/components/admin/ModelHealthPanel";
import { getModelHealth } from "@/lib/admin/modelHealth";
import { getAppSettings } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

// Admin-editable AI model config (direct user request, 2026-08-29). Rows
// are read live everywhere getModel() runs (lib/models.ts never caches),
// so anything saved here reflects on the very next AI call, no redeploy.
//
// Phase 52 section 3 added the observability half above the editor: which
// model is actually serving, the fallback chain's live state, and the kill
// switch's current setting with attribution. getModelConfigForAdmin()
// already gates on requireAdmin/requireRole, and this page renders under
// /admin's own layout guard, so the two reads added here inherit the same
// bar rather than opening a new door.
export default async function AdminAiModelsPage() {
  const [rows, health, settings] = await Promise.all([
    getModelConfigForAdmin(),
    getModelHealth(),
    getAppSettings(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">AI Models</h1>
        <p className="text-sm text-text-secondary">
          What is actually serving traffic, what is rate-limited, and which model each provider/tier resolves to. Config
          changes take effect immediately, for every user.
        </p>
      </div>
      <ModelHealthPanel health={health} settings={settings} />
      <AiModelsManager initialRows={rows} />
    </div>
  );
}
