import { getModelConfigForAdmin } from "@/actions/admin";
import { AiModelsManager } from "@/components/admin/AiModelsManager";

export const dynamic = "force-dynamic";

// Admin-editable AI model config (direct user request, 2026-08-29). Rows
// are read live everywhere getModel() runs (lib/models.ts never caches),
// so anything saved here reflects on the very next AI call, no redeploy.
export default async function AdminAiModelsPage() {
  const rows = await getModelConfigForAdmin();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">AI Models</h1>
        <p className="text-sm text-text-secondary">
          Which model each provider/tier resolves to. Changes take effect immediately, for every user.
        </p>
      </div>
      <AiModelsManager initialRows={rows} />
    </div>
  );
}
